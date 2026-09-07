# Parking System Web App

A clean, modern dashboard web application for a 3-story parking system.

## Stack
- **Backend**: Node.js, Express, SQLite
- **Frontend**: Vanilla HTML, CSS, JavaScript

## Setup & Running

1. Open a terminal in the project root directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   node backend/server.js
   ```
4. Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

## Testing the System

The dashboard includes a "Testing" feature to simulate entry and exit times so you can test all the fee calculation logic without waiting for real time to pass.

### 1. Car Entry
- Click **"New Car Entry"**. An alert will pop up showing the assigned slot and ticket ID.
- The system automatically fills Floor 1 (slots 100-199), then Floor 2, then Floor 3.
- Notice the live-updating "available" counts and the ticket appearing in the "Active Tickets" list.

### 2. Exit (Standard <= 3hrs)
- By default, checking out immediately calculates to 0 hours, which is under 3 hours, so the fee is **₱50**.
- Enter `50`, `100`, etc. and click **Pay & Exit**.

### 3. Exit (Standard > 3hrs)
- In the "Active Tickets" panel header, set the **Override Exit Time** to 5 hours *after* a ticket's entry time.
- Click **Checkout**. The fee should be **₱90** (₱50 for first 3 hours + ₱20 * 2 hours).

### 4. Over-night Logic (Crosses 10 PM)
- Set the **Override Entry Time** (Left Panel) to today at `21:00` (9:00 PM).
- Click **New Car Entry**.
- Set the **Override Exit Time** (Right Panel) to tomorrow at `08:00` (8:00 AM).
- Click **Checkout**.
- The fee will be **₱350** (₱300 overnight flat fee + ₱50 pre-10PM fee for the 1 hour between 9PM-10PM).

### 5. TOWED Logic (>= 24 hours)
- Set the **Override Entry Time** to yesterday.
- Click **New Car Entry**.
- Set the **Override Exit Time** to today, ensuring the gap is > 24 hours.
- Click **Checkout**. The status will be **TOWED** and the fee will be ₱0. You just acknowledge it.

### 6. Payment Validation
- During checkout, try entering invalid denominations (e.g., `35` or `125`). The system will reject it because the text field only accepts combinations of 20, 50, 100, 500, and 1000 bills.
- Try entering a valid large amount like `1000` for a `50` fee. The receipt will show the change amount (**₱950**) and a breakdown of bills returned to the customer, prioritizing the largest bills first (e.g., 500x1, 100x4, 50x1).

