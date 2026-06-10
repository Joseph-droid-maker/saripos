# 🏪 SariPOS — Point of Sale System

A full-stack web POS for sari-sari stores and small shops.
**Stack:** React + Vite (frontend) · PHP (backend) · MySQL (database) · XAMPP (local server)

---

## 📦 What's Included

```
sari-pos/
├── .htaccess            ← Copy to htdocs/saripos/ for production
├── backend/
│   ├── database.sql     ← Import this into phpMyAdmin
│   ├── config/          ← DB credentials + CORS config
│   ├── middleware/      ← Auth session guard
│   ├── api/             ← All PHP endpoints
│   └── uploads/         ← Product images saved here
└── frontend/
    ├── src/             ← React source code
    ├── package.json
    └── vite.config.js
```

---

## ⚡ Quick Setup (XAMPP — Development)

### Step 1 — Prerequisites

- [XAMPP](https://www.apachefriends.org/) installed (Apache + MySQL)
- [Node.js](https://nodejs.org/) v18 or higher installed

### Step 2 — Place files

Copy the entire `sari-pos/` folder into your XAMPP htdocs:

```
C:/xampp/htdocs/saripos/
```

Your folder structure should look like:
```
C:/xampp/htdocs/saripos/
├── .htaccess
├── backend/
└── frontend/
```

### Step 3 — Start XAMPP

Open XAMPP Control Panel → Start **Apache** and **MySQL**.

### Step 4 — Create the database

1. Open your browser → go to `http://localhost/phpmyadmin`
2. Click **New** (left sidebar)
3. Database name: `sari_pos` → Collation: `utf8mb4_unicode_ci` → Click **Create**
4. Click **Import** tab → Choose File → select `backend/database.sql` → Click **Go**

You should see: *Import has been successfully finished.*

### Step 5 — Install frontend dependencies

Open a terminal (Command Prompt or PowerShell):

```bash
cd C:/xampp/htdocs/saripos/frontend
npm install
```

### Step 6 — Start the dev server

```bash
npm run dev
```

Open your browser → `http://localhost:5173`

---

## 🔐 Default Login Credentials

| Username | Password   | Role  |
|----------|------------|-------|
| `admin`  | `admin123` | Admin |
| `staff1` | `staff123` | Staff |

> ⚠️ **Change these passwords immediately** after first login via the Users page.

---

## 🚀 Production Deployment (XAMPP — No Dev Server)

When you want to run the app without `npm run dev`:

### Step 1 — Build the React app

```bash
cd C:/xampp/htdocs/saripos/frontend
npm run build
```

This creates a `sari-pos/dist/` folder with compiled assets.

### Step 2 — Copy build output

Copy everything **inside** `dist/` into `C:/xampp/htdocs/saripos/`:

```
C:/xampp/htdocs/saripos/
├── index.html        ← from dist/
├── assets/           ← from dist/
├── .htaccess         ← already there
└── backend/          ← already there
```

### Step 3 — Access the app

Open browser → `http://localhost/saripos`

---

## 📂 API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/backend/api/auth/login.php` | Login |
| POST | `/backend/api/auth/logout.php` | Logout |
| GET  | `/backend/api/auth/check.php` | Check session |
| GET  | `/backend/api/products/index.php` | List products |
| POST | `/backend/api/products/index.php` | Create product |
| PUT  | `/backend/api/products/single.php?id=N` | Update product |
| DELETE | `/backend/api/products/single.php?id=N` | Delete product |
| POST | `/backend/api/products/upload.php` | Upload product image |
| POST | `/backend/api/products/import.php` | CSV import |
| GET  | `/backend/api/categories/index.php` | List categories |
| GET  | `/backend/api/transactions/index.php` | List transactions |
| POST | `/backend/api/transactions/index.php` | Create transaction |
| GET  | `/backend/api/transactions/single.php?id=N` | Transaction detail |
| GET  | `/backend/api/reports/daily.php` | Daily sales |
| GET  | `/backend/api/reports/monthly.php` | Monthly sales |
| GET  | `/backend/api/reports/best_selling.php` | Best sellers |
| GET  | `/backend/api/reports/low_stock.php` | Low stock alert |
| GET  | `/backend/api/users/index.php` | List users |
| POST | `/backend/api/users/index.php` | Create user |
| PUT  | `/backend/api/users/single.php?id=N` | Update user |

---

## 📄 CSV Import Format

Download the template from the Products page, or create a CSV with these columns:

```csv
name,sku,price,stock,category
Coca-Cola 1.5L,CC-1.5L,75.00,50,Drinks
Lucky Me Pancit Canton,LM-PC,14.00,200,Noodles
Safeguard Soap,SG-SOAP,38.00,80,Toiletries
```

**Rules:**
- `name` and `price` are **required**
- `sku` must be unique (if blank, a new product is always created)
- `category` must match an existing category name exactly (case-insensitive)
- If a SKU already exists → stock is **added** (not replaced)

---

## ⚙️ Configuration

Edit `backend/config/database.php` to change DB credentials:

```php
define('DB_HOST', 'localhost');
define('DB_USER', 'root');      // your MySQL username
define('DB_PASS', '');          // your MySQL password
define('DB_NAME', 'sari_pos');  // your database name
```

---

## 🖨️ Receipt Printing

On the POS checkout screen:
- **Normal (A4):** Standard full-width receipt for any printer
- **Thermal (72mm):** Compact format for thermal receipt printers

Toggle the print mode before clicking Print on the receipt modal.

---

## 👥 User Roles

| Feature | Admin | Staff |
|---------|-------|-------|
| POS Terminal | ✅ | ✅ |
| View Products | ✅ | ✅ |
| Manage Products (CRUD) | ✅ | ❌ |
| Import CSV | ✅ | ❌ |
| Sales History | ✅ | ❌ |
| Reports | ✅ | ❌ |
| Manage Users | ✅ | ❌ |

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---------|-----|
| "Database connection failed" | Check XAMPP MySQL is running; verify `database.php` credentials |
| API returns 404 | Make sure `mod_rewrite` is enabled in XAMPP → Apache config |
| Images not uploading | Check `backend/uploads/products/` folder exists and is writable |
| Login not working | Clear browser cookies; verify database was imported correctly |
| CORS errors in browser | Confirm Vite dev server is running on port 5173 |

---

## 📝 Notes for Deployment to External Hosting

If the client deploys to shared hosting (e.g., cPanel):

1. Upload `backend/` to public_html (or a subfolder)
2. Upload the built `dist/` contents to the same folder
3. Import `database.sql` via phpMyAdmin
4. Update `backend/config/database.php` with host credentials
5. Update `frontend/vite.config.js` → change `basename` in `App.jsx` if subfolder differs

---

*Built with ❤️ — SariPOS v1.0*
