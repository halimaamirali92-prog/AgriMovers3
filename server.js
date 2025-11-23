const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const https = require("https");
const url = require("url"); 
// === M-PESA CONFIG ===
const MPESA_CONSUMER_KEY = "4S8EraEJQPTUvxVWeF9zm82d3rEV42LGO7Ac5LAlRGDivH2Q";
const MPESA_CONSUMER_SECRET = "QFAUlExgRQH8jA4nI86ZVlpdMwG1swYWmykDSTfYO8psHe82FkpCvPcgYyB3M0j0";
const MPESA_SHORTCODE = "174379";
const MPESA_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
const MPESA_CALLBACK_URL = "https://cherri-blunderful-unconvertibly.ngrok-free.dev/api/mpesa/callback";
const MPESA_ENVIRONMENT = "sandbox";
let mpesaAccessToken = null;
let tokenExpiry = 0;
const app = express();
app.set('trust proxy', 1);
// === GET MPESA ACCESS TOKEN ===
async function getMpesaToken() {
  if (mpesaAccessToken && Date.now() < tokenExpiry) {
    return mpesaAccessToken;
  }
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
  const url = `https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    mpesaAccessToken = response.data.access_token;
    tokenExpiry = Date.now() + response.data.expires_in * 1000 - 60000; // 1 min buffer
    console.log("M-Pesa token refreshed");
    return mpesaAccessToken;
  } catch (err) {
    console.error("M-Pesa token error:", err.response?.data || err.message);
    throw new Error("Failed to get M-Pesa token");
  }
}
// === QUERY STK STATUS ===
async function queryStkStatus(shortcode, passkey, checkoutRequestID, token) {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);  // NEW: Generate fresh timestamp here
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");  // NEW: Use new timestamp for password
  const queryPayload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,  // NEW: Use the fresh one
    CheckoutRequestID: checkoutRequestID
  };
  try {
    const res = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
      queryPayload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (err) {
    console.error("STK Query error:", err.response?.data || err.message);
    return null;
  }
}
// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });
// =================== SESSION (ONE TIME ONLY) ===================
const sessionMiddleware = session({
  secret: "agrimovers_secret_key_change_this",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 },
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(sessionMiddleware); // ONLY ONCE
// MySQL connection
// ==== FINAL WORKING DATABASE CONNECTION FOR RENDER + AIVEN (NO FILES NEEDED) ====
const mysql = require("mysql2");

const db = mysql.createPool(
  process.env.DATABASE_URL
    ? {
        connectionLimit: 10,
        host: new URL(process.env.DATABASE_URL).hostname,
        port: new URL(process.env.DATABASE_URL).port,
        user: new URL(process.env.DATABASE_URL).username,
        password: new URL(process.env.DATABASE_URL).password,
        database: new URL(process.env.DATABASE_URL).pathname.slice(1),
        ssl: { rejectUnauthorized: true },
        waitForConnections: true,
        queueLimit: 0
      }
    : {
        host: "localhost",
        user: "root",
        password: "",
        database: "agrimovers3"
      }
);

// Test connection
db.getConnection((err) => {
  if (err) {
    console.error("DATABASE CONNECTION FAILED:", err.message);
    process.exit(1);
  } else {
    console.log("Successfully connected to Aiven MySQL on Render!");
  }
});
/* Helpers */
function ensureAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.headers["content-type"]?.includes("application/json")) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.redirect("/login.html");
  }

  // Check suspension using cached session value
  if (req.session.suspended === 1) {
    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", err);
      res.clearCookie("connect.sid");
      if (req.headers["content-type"]?.includes("application/json")) {
        return res.status(403).json({ message: "Your account has been suspended. Contact support." });
      }
      return res.redirect("/login.html?message=account_suspended");
    });
  } else {
    return next();
  }
}

function ensureRole(role) {
  return (req, res, next) => {
    if (req.session?.role === role) return next();
    if (req.headers["content-type"]?.includes("application/json"))
      return res.status(403).json({ message: "Forbidden" });
    return res.status(403).send("Forbidden");
  };
}
/* ---------------- AUTH ---------------- */
app.post("/register", async (req, res) => {
  try {
    const fullname = (req.body.fullname || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    const confirmpassword = req.body.confirmpassword;
    const role = req.body.role || "farmer";
    if (!fullname || !email || !password || !confirmpassword)
      return res.status(400).json({ message: "All fields required" });
    if (password !== confirmpassword)
      return res.status(400).json({ message: "Passwords do not match" });
    const [existing] = await db.promise().query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0)
      return res.status(400).json({ message: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    await db.promise().query(
      "INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)",
      [fullname, email, hash, role]
    );
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: "Database error during registration." });
  }
});
app.post("/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    const [rows] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length) return res.status(401).json({ message: "Invalid credentials." });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials." });
    
    // Check if suspended
    if (user.suspended === 1) {
      return res.status(403).json({ message: "Your account has been suspended. Contact support." });
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.name = user.fullname;
    req.session.suspended = user.suspended;  // Cache for middleware
    
    res.json({ message: "Login successful", role: user.role });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Database error during login." });
  }
});
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/index.html");
  });
});
/* ---------------- FARMER ROUTES ---------------- */
app.get("/api/farmer/profile", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT fullname, email, phone, location, profile_image, lat, lng FROM users WHERE id = ?",
      [req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found" });
    const user = rows[0];
    res.json({
      fullname: user.fullname,
      email: user.email,
      phone: user.phone || "",
      location: user.location || "",
      lat: user.lat || null,
      lng: user.lng || null,
      profile_image_url: user.profile_image ? `/uploads/${user.profile_image}` : "default-profile.png",
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.post("/api/farmer/update-profile", ensureAuth, ensureRole("farmer"), upload.single("profile_image"), async (req, res) => {
  try {
    const { fullname, phone, location, lat, lng } = req.body;
    const profile_image = req.file ? req.file.filename : null;

    const fields = [];
    const values = [];

    if (fullname?.trim()) { fields.push("fullname = ?"); values.push(fullname.trim()); }
    if (phone?.trim()) { fields.push("phone = ?"); values.push(phone.trim()); }
    if (location !== undefined) { fields.push("location = ?"); values.push(location?.trim() || null); }
    if (lat !== undefined && lat !== '') { fields.push("lat = ?"); values.push(parseFloat(lat)); }
    if (lng !== undefined && lng !== '') { fields.push("lng = ?"); values.push(parseFloat(lng)); }
    if (profile_image) { fields.push("profile_image = ?"); values.push(profile_image); }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });

    values.push(req.session.userId);
    const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;
    await db.promise().query(sql, values);

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Database error updating profile" });
  }
});
app.get("/api/transporter/:id/rates", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const [rows] = await db.promise().query("SELECT vehicle_type, rate_per_km FROM transporter_rates WHERE transporter_id=?", [req.params.id]);
    const obj = {};
    rows.forEach((r) => (obj[r.vehicle_type] = r.rate_per_km));
    res.json(obj);
  } catch (err) {
    console.error("Get transporter rate error:", err);
    res.status(500).json({ message: "Database error" });
  }
});
app.post("/api/farmer/request", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const { 
      produce, 
      quantity, 
      pickup_location, 
      destination, 
      vehicleType, 
      distance_km, 
      transporterId,
      pickup_lat,
      pickup_lng,
      dest_lat,
      dest_lng 
    } = req.body;

    const farmerId = req.session.userId;
    const farmerName = req.session.name;

    const [transporter] = await db.promise().query(
      "SELECT fullname FROM users WHERE id = ? AND role = 'transporter'", 
      [transporterId]
    );

    if (!transporter.length) {
      return res.status(400).json({ message: "Invalid transporter selected" });
    }

    const transporterName = transporter[0].fullname;

    await db.promise().query(
      `INSERT INTO transport_requests 
      (farmer_id, farmer_name, produce, quantity, pickup_location, destination, 
       vehicleType, distance_km, transporter_id, transporter_name, status,
       pickup_lat, pickup_lng, dest_lat, dest_lng) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
      [
        farmerId,
        farmerName,
        produce,
        quantity,
        pickup_location,
        destination,
        vehicleType,
        distance_km,
        transporterId,
        transporterName,
        parseFloat(pickup_lat) || null,
        parseFloat(pickup_lng) || null,
        parseFloat(dest_lat) || null,
        parseFloat(dest_lng) || null
      ]
    );

    const newRequest = {
      farmer_name: farmerName,
      produce,
      quantity,
      pickup_location,
      destination,
      vehicleType,
      status: 'Pending'
    };

    // Notify transporter via socket
    const sockets = transporterSockets.get(transporterId);
    if (sockets && sockets.size > 0) {
      sockets.forEach(socketId => {
        io.to(socketId).emit('new-request', newRequest);
      });
    }

    res.json({ message: "Request submitted successfully" });
  } catch (err) {
    console.error("Request create error:", err.message);
    res.status(500).json({ message: "Database error creating request", error: err.message });
  }
});
app.get("/my-requests", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT *, pickup_lat, pickup_lng, dest_lat, dest_lng FROM transport_requests WHERE farmer_id = ? ORDER BY created_at DESC",
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error." });
  }
});
// Auto-create dispute if low rating (complaint)
app.post("/api/farmer/rate/:id", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    if (!rating) return res.status(400).json({ message: "Rating required" });
    const intRating = parseInt(rating);
    await db.promise().query(
      "UPDATE transport_requests SET rating = ?, feedback = ? WHERE id = ? AND farmer_id = ? AND status = 'Delivered'",
      [intRating, feedback || null, req.params.id, req.session.userId]
    );

    // If low rating (<=2), create dispute for admin
    if (intRating <= 2) {
      const [reqData] = await db.promise().query(
        "SELECT transporter_id FROM transport_requests WHERE id = ?",
        [req.params.id]
      );
      if (reqData.length) {
        const description = feedback ? `Low rating (${intRating}/5): ${feedback}` : `Low rating (${intRating}/5) - No feedback provided.`;
        await db.promise().query(
          "INSERT INTO disputes (farmer_id, transporter_id, description, status) VALUES (?, ?, ?, 'Pending')",
          [req.session.userId, reqData[0].transporter_id, description]
        );
        // Optional: Notify admin via socket or email
      }
    }

    res.json({ message: "Rating submitted successfully" });
  } catch (err) {
    console.error("Rating error:", err);
    res.status(500).json({ message: "Database error submitting rating" });
  }
});
app.post("/api/farmer/pay", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const { requestId } = req.body;
    const farmerId = req.session.userId;
    const [request] = await db.promise().query(
      "SELECT total_amount, checkout_request_id, phone, transporter_id FROM transport_requests tr JOIN users u ON tr.farmer_id = u.id WHERE tr.id = ? AND tr.farmer_id = ?",
      [requestId, farmerId]
    );
    if (!request.length || !request[0].total_amount) {
      return res.status(400).json({ message: "No payment pending" });
    }
    const [existingPay] = await db.promise().query(
      "SELECT id, status FROM payments WHERE request_id = ? ORDER BY created_at DESC LIMIT 1",
      [requestId]
    );
    if (existingPay.length && existingPay[0].status === 'Pending') {
      return res.status(400).json({ message: "Payment already initiated" });
    }
    const token = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString("base64");
    const phone = request[0].phone.replace(/\D/g, "");
    if (!/^254[71]/.test(phone)) {
      return res.status(400).json({ message: "Invalid phone" });
    }
    const stkPayload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: parseInt(request[0].total_amount),
      PartyA: phone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: `REQ${requestId}`,
      TransactionDesc: `Payment for request #${requestId}`,
    };
    console.log("STK Payload:", stkPayload);  // For debugging
    const stkRes = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      stkPayload,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (stkRes.data.ResponseCode !== "0") {
      throw new Error("STK Push failed: " + stkRes.data.ResponseDescription);
    }
    const checkoutID = stkRes.data.CheckoutRequestID;
    await db.promise().query(
      "UPDATE transport_requests SET checkout_request_id = ? WHERE id = ?",
      [checkoutID, requestId]
    );
    await db.promise().query(
      "INSERT INTO payments (request_id, amount, phone, checkout_request_id, status) VALUES (?, ?, ?, ?, 'Pending')",
      [requestId, parseInt(request[0].total_amount), phone, checkoutID]
    );
    res.json({ message: "STK Push sent" });

    // Start polling for status
    let pollCount = 0;
    const maxPolls = 12;  // 60s / 5s = 12
    const pollInterval = setInterval(async () => {
      pollCount++;
      const queryRes = await queryStkStatus(MPESA_SHORTCODE, MPESA_PASSKEY, checkoutID, token);  // UPDATED: No timestamp passed
      if (queryRes) {
        console.log("Poll result:", queryRes);
        const resultCode = queryRes.ResultCode;
        let status = resultCode === "0" ? 'Completed' : 'Failed';
        let errorMessage = queryRes.ResultDesc || null;
        let mpesaReceipt = resultCode === "0" ? queryRes.Item?.find(i => i.Name === "MpesaReceiptNumber")?.Value : null;

        await db.promise().query(
          "UPDATE payments SET status = ?, mpesa_response = ?, error_message = ? WHERE checkout_request_id = ?",
          [status, JSON.stringify(queryRes), errorMessage, checkoutID]
        );

        if (resultCode === "0") {
          await db.promise().query(
            "UPDATE transport_requests SET payment_status = 'Paid', mpesa_receipt = ? WHERE id = ?",
            [mpesaReceipt, requestId]
          );
          // Emit success to both
          io.to(`farmer_${farmerId}`).emit('payment-success', { requestId, receipt: mpesaReceipt });
          io.to(`transporter_${request[0].transporter_id}`).emit('payment-success', { requestId });
          clearInterval(pollInterval);
        } else if (resultCode === "1" || pollCount >= maxPolls) {  // Cancelled or expired
          await db.promise().query("UPDATE payments SET status = 'Expired' WHERE checkout_request_id = ?", [checkoutID]);
          await db.promise().query("UPDATE transport_requests SET checkout_request_id = NULL WHERE id = ?", [requestId]);
          clearInterval(pollInterval);
        }
      }
      if (pollCount >= maxPolls) clearInterval(pollInterval);
    }, 5000);  // Poll every 5s
  } catch (err) {
    console.error("Pay error:", err);
    res.status(500).json({ message: "Payment failed" });
  }
});
// FARMER DISPUTES ROUTE 
app.get("/api/farmer/disputes", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        d.id, 
        d.description, 
        d.status, 
        d.admin_notes, 
        d.created_at,
        u.fullname AS transporter_name
      FROM disputes d
      JOIN users u ON d.transporter_id = u.id
      WHERE d.farmer_id = ?
      ORDER BY d.created_at DESC
    `, [req.session.userId]);

    res.json(rows);
  } catch (err) {
    console.error("Error loading farmer disputes:", err);
    res.status(500).json({ message: "Error loading disputes" });
  }
});
// Allow farmer to save their GPS location
app.post("/api/farmer/update-location", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: "lat and lng required" });

    await db.promise().query(
      "UPDATE users SET lat = ?, lng = ? WHERE id = ?",
      [parseFloat(lat), parseFloat(lng), req.session.userId]
    );
    res.json({ message: "Location updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save location" });
  }
});
/* ---------------- TRANSPORTER ROUTES ---------------- */
app.post("/api/transporter/profile", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const transporterId = req.session.userId;
    const { availability, numLorry, numVan, numPickup, numTractor, lat, lng } = req.body;
    await db.promise().query(
      `UPDATE users  
      SET availability = ?, num_lorry = ?, num_van = ?, num_pickup = ?, num_tractor = ?, lat = ?, lng = ? 
      WHERE id = ?`,
      [
        availability ? 1 : 0,
        numLorry || 0,
        numVan || 0,
        numPickup || 0,
        numTractor || 0,
        lat ? parseFloat(lat) : null,
        lng ? parseFloat(lng) : null,
        transporterId
      ]
    );
    res.json({ message: "Profile & location updated!" });
  } catch (err) {
    console.error("Transporter profile update error", err);
    res.status(500).json({ message: "Database error" });
  }
});
app.get("/api/transporter/profile", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT availability, num_lorry, num_van, num_pickup, num_tractor, lat, lng FROM users WHERE id = ?`,
      [req.session.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "No profile data yet." });
    }
    const p = rows[0];
    res.json({
      availability: p.availability || 0,
      num_lorry: p.num_lorry || 0,
      num_van: p.num_van || 0,
      num_pickup: p.num_pickup || 0,
      num_tractor: p.num_tractor || 0,
      lat: p.lat || null,
      lng: p.lng || null
    });
  } catch (err) {
    console.error("GET /api/transporter/profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.get("/api/transporters-with-rates", ensureAuth, ensureRole("farmer"), async (req, res) => {
  try {
    const farmerLat = parseFloat(req.query.lat);
    const farmerLng = parseFloat(req.query.lng);
    let transporters = [];

    // ADD THIS LINE IN BOTH QUERIES: AND suspended = 0
    if (farmerLat && farmerLng) {
      const [geoTrans] = await db.promise().query( 
        `SELECT id, fullname AS transporter_name, availability, lat, lng, 
                (6371 * acos( 
                  cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +  
                  sin(radians(?)) * sin(radians(lat)) 
                )) AS distance_km 
         FROM users  
         WHERE role = 'transporter'  
           AND availability = 1  
           AND suspended = 0                     -- ADD THIS
           AND lat IS NOT NULL  
           AND lng IS NOT NULL 
         HAVING distance_km <= 100  
         ORDER BY distance_km ASC `, [farmerLat, farmerLng, farmerLat]);
      transporters = geoTrans;
    } else {
      const [allTrans] = await db.promise().query(
        "SELECT id, fullname AS transporter_name, availability, lat, lng FROM users WHERE role='transporter' AND availability=1 AND suspended = 0"  // ADD THIS
      );
      transporters = allTrans.map(t => ({ ...t, distance_km: null }));
    }

    if (transporters.length === 0) return res.json([]);

    const transporterIds = transporters.map(t => t.id);
    const [rates] = await db.promise().query(
      `SELECT transporter_id, vehicle_type, rate_per_km FROM transporter_rates WHERE transporter_id IN (?)`,
      [transporterIds.length ? transporterIds : [0]]
    );

    const result = transporters.map(t => {
      const rateMap = {};
      rates.filter(r => r.transporter_id === t.id).forEach(r => rateMap[r.vehicle_type] = r.rate_per_km);
      return { ...t, rates: rateMap };
    }).filter(t => Object.keys(t.rates).length > 0);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
app.post("/api/transporter/rate", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const transporterId = req.session.userId;
    const { vehicle_type, rate_per_km } = req.body;
    if (!vehicle_type || !rate_per_km) return res.status(400).json({ message: "vehicle_type and rate_per_km required" });
    await db.promise().query(
      `INSERT INTO transporter_rates (transporter_id, vehicle_type, rate_per_km) 
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rate_per_km = VALUES(rate_per_km)`,
      [transporterId, vehicle_type, rate_per_km]
    );
    res.json({ message: "Rate saved" });
  } catch (err) {
    console.error("Rate save error", err);
    res.status(500).json({ message: "Database error saving rate" });
  }
});
app.post("/api/transporter/update-status/:id", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Picked", "En Route", "Delivered"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [reqData] = await db.promise().query(
      "SELECT payment_status, farmer_id FROM transport_requests WHERE id = ? AND transporter_id = ?",
      [req.params.id, req.session.userId]
    );
    if (!reqData.length) return res.status(404).json({ message: "Request not found" });
    if (status === "Picked" && reqData[0].payment_status !== "Paid") {
      return res.status(400).json({ message: "Payment required before pickup" });
    }
    await db.promise().query(
      "UPDATE transport_requests SET status = ? WHERE id = ? AND transporter_id = ?",
      [status, req.params.id, req.session.userId]
    );
    // Notify farmer
    io.to(`farmer_${reqData[0].farmer_id}`).emit('request-updated', {
      id: req.params.id,
      status: status
    });
    res.json({ message: `Status updated to ${status}` });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.get("/api/transporter/ratings", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT farmer_name, produce, rating, feedback, created_at 
      FROM transport_requests 
      WHERE transporter_id = ? AND rating IS NOT NULL 
      ORDER BY created_at DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Fetch ratings error:", err);
    res.status(500).json({ message: "Database error fetching ratings" });
  }
});
app.get("/api/transporter/rates", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const transporterId = req.session.userId;
    const [rows] = await db.promise().query(
      "SELECT vehicle_type, rate_per_km FROM transporter_rates WHERE transporter_id = ?",
      [transporterId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Get rates error:", err);
    res.status(500).json({ message: "Database error getting rates" });
  }
});
app.get("/transporter/requests", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT  
        id, farmer_name, produce, quantity, pickup_location, destination,  
        vehicleType, status, payment_status, total_amount 
      FROM transport_requests  
      WHERE transporter_id = ?  
      ORDER BY created_at DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Transporter requests error:", err);
    res.status(500).json({ message: "Database error" });
  }
});
app.post("/api/transporter/respond/:id", ensureAuth, ensureRole("transporter"), async (req, res) => {
  try {
    const transporterId = req.session.userId;
    const { action, proposed_rate } = req.body;
    const validActions = ["Accepted", "Rejected", "Negotiating"];
    if (!validActions.includes(action)) return res.status(400).json({ message: "Invalid action" });
    const [request] = await db.promise().query(
      "SELECT farmer_id, distance_km, vehicleType, transporter_id FROM transport_requests WHERE id = ?",
      [req.params.id]
    );
    if (!request.length || request[0].transporter_id !== transporterId)
      return res.status(404).json({ message: "Request not found" });
    const farmerId = request[0].farmer_id;
    const distanceKm = request[0].distance_km;
    const vehicleType = request[0].vehicleType;
    // === GET RATE ===
    const [rateRow] = await db.promise().query(
      "SELECT rate_per_km FROM transporter_rates WHERE transporter_id = ? AND vehicle_type = ?",
      [transporterId, vehicleType]
    );
    if (!rateRow.length) return res.status(400).json({ message: "Rate not set" });
    const totalAmount = Math.ceil(distanceKm * rateRow[0].rate_per_km);
    let newStatus = action;
    let paymentStatus = "Pending";
    if (action === "Accepted") {
      newStatus = "Accepted";
      paymentStatus = "Pending";
    }
    // UPDATE DB
    await db.promise().query(
      `UPDATE transport_requests  
      SET transporter_response = ?, proposed_rate = ?, status = ?, payment_status = ?, total_amount = ? 
      WHERE id = ? AND transporter_id = ?`,
      [action, proposed_rate || null, newStatus, paymentStatus, action === "Accepted" ? totalAmount : null, req.params.id, transporterId]
    );
    // NOTIFY FARMER
    io.to(`farmer_${farmerId}`).emit('request-updated', {
      id: req.params.id,
      status: newStatus,
      payment_status: paymentStatus,
      total_amount: totalAmount,
    });
    res.json({ message: `Request ${action.toLowerCase()}`, total_amount: totalAmount });
  } catch (err) {
    console.error("Respond error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.post("/api/mpesa/callback", async (req, res) => {
  try {
    const callback = req.body;
    console.log("M-Pesa Callback:", JSON.stringify(callback, null, 2));
    if (!callback.Body?.stkCallback) {
      return res.json({ success: false });
    }
    const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback.Body.stkCallback;
    let status = ResultCode === 0 ? 'Completed' : 'Failed';
    const errorMessage = ResultCode !== 0 ? callback.Body.stkCallback.ResultDesc : null;
    const items = CallbackMetadata?.Item || [];
    const amount = items.find(i => i.Name === "Amount")?.Value;
    const mpesaReceipt = items.find(i => i.Name === "MpesaReceiptNumber")?.Value;

    // Find and update payment log
    const [payment] = await db.promise().query(
      "SELECT id, request_id, farmer_id, transporter_id FROM payments p JOIN transport_requests tr ON p.request_id = tr.id WHERE p.checkout_request_id = ?",
      [CheckoutRequestID]
    );
    if (!payment.length) {
      return res.json({ success: false });
    }
    const payId = payment[0].id;
    const reqId = payment[0].request_id;
    const farmerId = payment[0].farmer_id;
    const transporterId = payment[0].transporter_id;

    await db.promise().query(
      "UPDATE payments SET status = ?, mpesa_response = ?, error_message = ? WHERE id = ?",
      [status, JSON.stringify(callback), errorMessage, payId]
    );

    if (ResultCode === 0) {
      await db.promise().query(
        "UPDATE transport_requests SET payment_status = 'Paid', mpesa_receipt = ? WHERE id = ?",
        [mpesaReceipt, reqId]
      );
      // NOTIFY BOTH
      io.to(`farmer_${farmerId}`).emit('payment-success', { requestId: reqId, receipt: mpesaReceipt });
      io.to(`transporter_${transporterId}`).emit('payment-success', { requestId: reqId });
      console.log(`Payment confirmed: KES ${amount} | Receipt: ${mpesaReceipt}`);
    } else {
      // On failure, reset for retry
      await db.promise().query("UPDATE transport_requests SET checkout_request_id = NULL WHERE id = ?", [reqId]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).json({ error: "Callback failed" });
  }
});
/* ---------------- ADMIN ROUTES ---------------- */
app.get("/admin", ensureAuth, ensureRole("admin"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.post("/admin/approve/:id", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const [exists] = await db.promise().query("SELECT id FROM transport_requests WHERE id = ?", [req.params.id]);
    if (!exists.length) return res.status(404).json({ message: "Request not found" });
    await db.promise().query("UPDATE transport_requests SET payment_status='Approved' WHERE id=?", [req.params.id]);
    res.json({ message: "Payment approved" });
  } catch (err) {
    console.error("Admin approve error:", err);
    res.status(500).json({ message: "Database error approving payment" });
  }
});
app.get("/admin/users", ensureAuth, ensureRole("admin"), async (req, res) => {
  const [rows] = await db.promise().query("SELECT id, fullname, email, role, created_at, suspended FROM users");
  res.json(rows);
});
app.post("/admin/toggle-suspend/:id", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason } = req.body;

    const [user] = await db.promise().query("SELECT suspended FROM users WHERE id = ?", [userId]);
    if (!user.length) return res.status(404).json({ message: "User not found" });

    const currentlySuspended = user[0].suspended === 1;
    const newStatus = currentlySuspended ? 0 : 1;   // TOGGLE

    await db.promise().query("UPDATE users SET suspended = ? WHERE id = ?", [newStatus, userId]);

    // Optional: log the reason only when suspending
    if (!currentlySuspended && reason) {
      await db.promise().query(
        "INSERT INTO flags (user_id, admin_id, reason) VALUES (?, ?, ?)",
        [userId, req.session.userId, reason]
      );
    }

    res.json({ 
      message: currentlySuspended ? "User unsuspended" : "User suspended",
      suspended: newStatus 
    });
  } catch (err) {
    console.error("Toggle suspend error:", err);
    res.status(500).json({ message: "Database error" });
  }
});
app.delete("/admin/delete-user/:id", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const [exists] = await db.promise().query("SELECT id FROM users WHERE id = ?", [req.params.id]);
    if (!exists.length) return res.status(404).json({ message: "User not found" });
    await db.promise().query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Database error deleting user" });
  }
});
app.get("/admin/requests", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        tr.id,
        tr.farmer_id,
        tr.farmer_name,
        tr.transporter_id,
        tr.transporter_name,
        tr.produce,
        tr.quantity,
        tr.pickup_location,
        tr.destination,
        tr.vehicleType,
        tr.distance_km,
        tr.total_amount,
        tr.status,
        tr.payment_status,
        tr.mpesa_receipt,
        tr.created_at,
        f.email AS farmer_email,
        f.phone AS farmer_phone,
        t.email AS transporter_email,
        t.phone AS transporter_phone
      FROM transport_requests tr
      LEFT JOIN users f ON tr.farmer_id = f.id
      LEFT JOIN users t ON tr.transporter_id = t.id
      ORDER BY tr.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Admin requests error:", err);
    res.status(500).json({ message: "Database error" });
  }
});
app.get("/admin/payments", ensureAuth, ensureRole("admin"), async (req, res) => {
  const [rows] = await db.promise().query("SELECT id, farmer_name, transporter_name, payment_status FROM transport_requests");
  res.json(rows);
});
// Fetch all disputes
app.get("/admin/disputes", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT d.id, d.description, d.status, u1.fullname AS farmer_name, u2.fullname AS transporter_name 
       FROM disputes d 
       LEFT JOIN users u1 ON d.farmer_id = u1.id 
       LEFT JOIN users u2 ON d.transporter_id = u2.id 
       ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("Fetch disputes error:", err);
    res.status(500).json({ message: "Database error fetching disputes" });
  }
});

// Resolve a dispute (update status to 'Resolved')
app.post("/admin/resolve-dispute/:id", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const { notes } = req.body;

    // First resolve the dispute
    await db.promise().query(
      "UPDATE disputes SET status = 'Resolved', resolved_at = NOW(), admin_notes = ? WHERE id = ?",
      [notes || null, req.params.id]
    );

    // Then fetch farmer_id and notify
    const [disputeData] = await db.promise().query(
      "SELECT farmer_id FROM disputes WHERE id = ?", 
      [req.params.id]
    );

    if (disputeData.length > 0) {
      const farmerId = disputeData[0].farmer_id;
      io.to(`farmer_${farmerId}`).emit('dispute-resolved', {
        disputeId: req.params.id,
        notes: notes || 'Your dispute has been resolved by admin.'
      });
    }

    res.json({ message: "Dispute resolved" });
  } catch (err) {
    console.error("Resolve dispute error:", err);
    res.status(500).json({ message: "Database error resolving dispute" });
  }
});

// Delete a dispute
app.delete("/admin/delete-dispute/:id", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    await db.promise().query("DELETE FROM disputes WHERE id = ?", [req.params.id]);
    res.json({ message: "Dispute deleted" });
  } catch (err) {
    console.error("Delete dispute error:", err);
    res.status(500).json({ message: "Database error deleting dispute" });
  }
});
app.get("/admin/report", ensureAuth, ensureRole("admin"), async (req, res) => {
  try {
    const PLATFORM_FEE_PERCENT = 10;

    // 1. Revenue & Earnings
    const [[revenue]] = await db.promise().query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) AS total_revenue,
        COALESCE(SUM(total_amount) * ${PLATFORM_FEE_PERCENT / 100}, 0) AS platform_earnings,
        COALESCE(SUM(total_amount) * ${(100 - PLATFORM_FEE_PERCENT) / 100}, 0) AS transporter_earnings
      FROM transport_requests 
      WHERE payment_status IN ('Paid', 'Approved')
    `);

    // 2. Busiest Regions (Top 8)
    const [regions] = await db.promise().query(`
      SELECT location, COUNT(*) as count 
      FROM (
        SELECT pickup_location AS location FROM transport_requests WHERE pickup_location IS NOT NULL
        UNION ALL
        SELECT destination FROM transport_requests WHERE destination IS NOT NULL
      ) combined
      GROUP BY location 
      ORDER BY count DESC 
      LIMIT 8
    `);

    // 3. Most Used Vehicles
    const [vehicles] = await db.promise().query(`
      SELECT vehicleType, COUNT(*) as count 
      FROM transport_requests 
      WHERE vehicleType IS NOT NULL 
      GROUP BY vehicleType 
      ORDER BY count DESC
    `);

    // 4. Ratings & Feedback
    const [[ratings]] = await db.promise().query(`
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as total_rated,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as low_ratings
      FROM transport_requests 
      WHERE rating IS NOT NULL
    `);

    // Send clean response (no peak_days)
    res.json({
      revenue: {
        total: Number(revenue.total_revenue) || 0,
        platform_fee: PLATFORM_FEE_PERCENT,
        platform_earnings: Number(revenue.platform_earnings) || 0,
        paid_to_transporters: Number(revenue.transporter_earnings) || 0
      },
      busiest_regions: regions,
      popular_vehicles: vehicles,
      feedback: {
        avg_rating: ratings.avg_rating ? Number(ratings.avg_rating).toFixed(1) : "N/A",
        total_reviews: Number(ratings.total_rated),
        low_rating_count: Number(ratings.low_ratings),
        satisfaction_rate: ratings.avg_rating ? Math.round((ratings.avg_rating / 5) * 100) + "%" : "N/A"
      }
    });

  } catch (err) {
    console.error("Advanced report error:", err);
    res.status(500).json({ message: "Error generating report" });
  }
});
/* ---------------- DASHBOARD ROUTES ---------------- */
app.get("/farmer", ensureAuth, ensureRole("farmer"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "farmer.html"));
});
app.get("/transporter", ensureAuth, ensureRole("transporter"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "transporter.html"));
});
/* ---------------- SESSION ---------------- */
app.get("/session-user", (req, res) => {
  if (req.session?.userId) {
    return res.json({
      loggedIn: true,
      user: { id: req.session.userId, name: req.session.name, role: req.session.role },
    });
  }
  return res.json({ loggedIn: false });
});

/* ---------------- SOCKET.IO SETUP ---------------- */
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const transporterSockets = new Map(); //
// Share session
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});
// SINGLE io.on("connection")
io.on("connection", (socket) => {
  const session = socket.request.session;
  // JOIN ROOMS
  if (session?.userId) {
    if (session.role === "farmer") {
      socket.join(`farmer_${session.userId}`);
      console.log(`Farmer ${session.userId} joined room: farmer_${session.userId}`);
    }
    if (session.role === "transporter") {
      const id = session.userId;
      if (!transporterSockets.has(id)) {
        transporterSockets.set(id, new Set());
      }
      transporterSockets.get(id).add(socket.id);
      console.log(`Transporter ${id} connected (socket: ${socket.id})`);
    }
  }
  // FARMER: JOIN TRACKING
  socket.on('join-tracking', (requestId) => {
    if (!session?.userId || session.role !== 'farmer') return;
    socket.join(`tracking_${requestId}`);
    console.log(`Farmer ${session.userId} joined tracking room: tracking_${requestId}`);
  });
  // TRANSPORTER: START TRACKING
  socket.on("start-tracking", async (requestId) => {
    if (!session?.userId || session.role !== "transporter") return;
    await db.promise().query(
      "UPDATE transport_requests SET tracking_active = 1 WHERE id = ? AND transporter_id = ?",
      [requestId, session.userId]
    );
    socket.join(`tracking_${requestId}`);
    console.log(`Transporter ${session.userId} started tracking for request ${requestId}`);
  });
  // UPDATE LOCATION
  socket.on("update-location", async (data) => {
    const { requestId, lat, lng } = data;
    if (!session?.userId || session.role !== "transporter") return;
    await db.promise().query(
      "UPDATE transport_requests SET current_lat = ?, current_lng = ?, tracking_active = 1 WHERE id = ? AND transporter_id = ?",
      [lat, lng, requestId, session.userId]
    );
    socket.to(`tracking_${requestId}`).emit("live-location", { requestId, lat, lng });
  });
  // STOP TRACKING
  socket.on("stop-tracking", async (requestId) => {
    if (!session?.userId || session.role !== "transporter") return;
    await db.promise().query(
      "UPDATE transport_requests SET tracking_active = 0 WHERE id = ?",
      [requestId]
    );
    socket.leave(`tracking_${requestId}`);
  });
  // DISCONNECT
  socket.on("disconnect", () => {
    if (session?.userId && session?.role === "transporter") {
      const id = session.userId;
      const set = transporterSockets.get(id);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) transporterSockets.delete(id);
      }
      console.log(`Transporter ${id} disconnected`);
    }
  });
});

/* ---------------- DEFAULT ---------------- */
app.get("/", (req, res) => {
  res.redirect("/index.html");
});

// === START THE SERVER (MUST USE 'server' because of Socket.IO) ===
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`AgriMovers3 is LIVE → https://agrimovers3.onrender.com`);
});