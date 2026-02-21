import aiosqlite
import json
from db.connection import DB_PATH


async def seed_db():
    """Seed mock financial data. Skips if data already exists."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM customers")
        row = await cursor.fetchone()
        if row and row[0] > 0:
            return  # already seeded

        # ============================================
        # CUSTOMERS (20 total)
        # 10 clean, 5 suspicious, 3 high-value, 2 locked
        # ============================================
        customers = [
            # Clean customers (C001-C010)
            ("C001", "John", "Smith", "john.smith@email.com", "555-0101", "4521", "1985-03-15", "123 Oak St", "Austin", "TX", "78701", "US", "drivers_license", "DL-TX-88412", "2028-03-15", 1, 0.1, "verified", "active", "2022-01-10"),
            ("C002", "Maria", "Garcia", "maria.garcia@email.com", "555-0102", "7832", "1990-07-22", "456 Pine Ave", "Miami", "FL", "33101", "US", "passport", "P-US-992341", "2029-07-22", 1, 0.05, "verified", "active", "2021-06-15"),
            ("C003", "James", "Chen", "james.chen@email.com", "555-0103", "1199", "1978-11-08", "789 Elm Blvd", "San Francisco", "CA", "94102", "US", "drivers_license", "DL-CA-55123", "2027-11-08", 1, 0.15, "verified", "active", "2020-09-01"),
            ("C004", "Sarah", "Johnson", "sarah.j@email.com", "555-0104", "3344", "1992-02-28", "321 Maple Dr", "Chicago", "IL", "60601", "US", "state_id", "SI-IL-77234", "2026-02-28", 1, 0.08, "verified", "active", "2023-03-20"),
            ("C005", "Robert", "Williams", "r.williams@email.com", "555-0105", "6677", "1988-09-12", "654 Cedar Ln", "Denver", "CO", "80201", "US", "drivers_license", "DL-CO-33987", "2027-09-12", 1, 0.12, "verified", "active", "2022-07-05"),
            ("C006", "Emily", "Davis", "emily.davis@email.com", "555-0106", "9900", "1995-05-30", "987 Birch Ct", "Seattle", "WA", "98101", "US", "passport", "P-US-441256", "2030-05-30", 1, 0.03, "verified", "active", "2023-01-12"),
            ("C007", "Michael", "Brown", "m.brown@email.com", "555-0107", "2211", "1982-12-01", "147 Walnut St", "Boston", "MA", "02101", "US", "drivers_license", "DL-MA-66890", "2028-12-01", 1, 0.09, "verified", "active", "2021-11-30"),
            ("C008", "Lisa", "Martinez", "lisa.m@email.com", "555-0108", "5533", "1993-04-17", "258 Spruce Way", "Portland", "OR", "97201", "US", "state_id", "SI-OR-44321", "2027-04-17", 1, 0.07, "verified", "active", "2022-05-18"),
            ("C009", "David", "Anderson", "d.anderson@email.com", "555-0109", "8844", "1975-08-25", "369 Ash Rd", "Nashville", "TN", "37201", "US", "drivers_license", "DL-TN-22567", "2026-08-25", 1, 0.11, "verified", "active", "2020-02-14"),
            ("C010", "Jennifer", "Taylor", "jen.taylor@email.com", "555-0110", "1122", "1987-01-09", "480 Willow Pl", "Atlanta", "GA", "30301", "US", "passport", "P-US-778834", "2029-01-09", 1, 0.06, "verified", "active", "2023-08-01"),
            # Suspicious customers (C011-C015)
            ("C011", "Viktor", "Petrov", "v.petrov@mail.ru", "555-0111", "4455", "1980-06-20", "55 Harbor St", "New York", "NY", "10001", "US", "passport", "P-RU-123456", "2025-06-20", 1, 0.72, "verified", "active", "2024-01-05"),
            ("C012", "Amanda", "Reed", "a.reed.refunds@email.com", "555-0112", "7788", "1991-10-14", "77 Quick Ave", "Las Vegas", "NV", "89101", "US", "drivers_license", "DL-NV-99001", "2027-10-14", 1, 0.65, "verified", "active", "2023-06-10"),
            ("C013", "Carlos", "Mendez", "c.mendez@email.com", "555-0113", "3366", "1986-03-03", "88 Offshore Blvd", "Houston", "TX", "77001", "US", "passport", "P-MX-554433", "2026-03-03", 0, 0.80, "pending", "active", "2024-06-01"),
            ("C014", "Diana", "Volkov", "d.volkov@email.com", "555-0114", "9911", "1983-07-19", "12 Shadow Ln", "Phoenix", "AZ", "85001", "US", "passport", "P-UA-887766", "2025-01-19", 1, 0.55, "verified", "active", "2023-12-15"),
            ("C015", "Frank", "Nguyen", "f.nguyen@email.com", "555-0115", "2244", "1994-12-05", "34 Rapid St", "San Diego", "CA", "92101", "US", "drivers_license", "DL-CA-11223", "2028-12-05", 1, 0.60, "verified", "active", "2024-02-20"),
            # High-value customers (C016-C018)
            ("C016", "Elizabeth", "Whitmore", "e.whitmore@wealthmgmt.com", "555-0116", "5566", "1970-09-08", "1 Park Ave PH", "New York", "NY", "10022", "US", "passport", "P-US-112233", "2030-09-08", 1, 0.02, "verified", "active", "2018-05-01"),
            ("C017", "Richard", "Blackwell", "r.blackwell@corp.com", "555-0117", "7799", "1965-04-22", "500 Lakeshore Dr", "Chicago", "IL", "60611", "US", "passport", "P-US-998877", "2029-04-22", 1, 0.04, "verified", "active", "2019-01-15"),
            ("C018", "Sophia", "Nakamura", "s.nakamura@invest.com", "555-0118", "3388", "1972-11-30", "200 Marina Blvd", "San Francisco", "CA", "94111", "US", "passport", "P-JP-665544", "2028-11-30", 1, 0.01, "verified", "active", "2017-11-20"),
            # Locked/compromised customers (C019-C020)
            ("C019", "Kevin", "Park", "k.park@email.com", "555-0119", "8822", "1989-02-14", "45 Locked Ave", "Dallas", "TX", "75201", "US", "drivers_license", "DL-TX-44556", "2027-02-14", 1, 0.35, "verified", "locked", "2022-08-10"),
            ("C020", "Rachel", "Kim", "r.kim@email.com", "555-0120", "1144", "1996-08-03", "67 Breach Rd", "Los Angeles", "CA", "90001", "US", "state_id", "SI-CA-33221", "2026-08-03", 1, 0.40, "verified", "suspended", "2023-04-25"),
        ]

        await db.executemany(
            "INSERT INTO customers (customer_id, first_name, last_name, email, phone, ssn_last4, date_of_birth, address_line1, address_city, address_state, address_zip, address_country, id_document_type, id_document_number, id_document_expiry, id_verified, risk_score, kyc_status, account_status, account_opened_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            customers,
        )

        # ============================================
        # ACCOUNTS
        # ============================================
        accounts = [
            ("ACC001", "C001", "checking", "****4521", "021000021", 15234.50, None, "USD", "active", "2022-01-10", "2025-09-15"),
            ("ACC002", "C001", "savings", "****4522", "021000021", 42000.00, None, "USD", "active", "2022-01-10", "2025-08-01"),
            ("ACC003", "C002", "checking", "****7832", "067014822", 8920.75, None, "USD", "active", "2021-06-15", "2025-09-14"),
            ("ACC004", "C002", "credit_card", "****7833", None, -2450.00, 10000.0, "USD", "active", "2021-06-15", "2025-09-15"),
            ("ACC005", "C003", "checking", "****1199", "121042882", 67500.00, None, "USD", "active", "2020-09-01", "2025-09-15"),
            ("ACC006", "C003", "credit_card", "****1200", None, -890.00, 25000.0, "USD", "active", "2020-09-01", "2025-09-10"),
            ("ACC007", "C004", "checking", "****3344", "071000013", 5600.25, None, "USD", "active", "2023-03-20", "2025-09-15"),
            ("ACC008", "C005", "checking", "****6677", "102001017", 12300.00, None, "USD", "active", "2022-07-05", "2025-09-12"),
            ("ACC009", "C005", "savings", "****6678", "102001017", 35000.00, None, "USD", "active", "2022-07-05", "2025-07-20"),
            ("ACC010", "C006", "checking", "****9900", "125008547", 22150.00, None, "USD", "active", "2023-01-12", "2025-09-15"),
            ("ACC011", "C007", "checking", "****2211", "011401533", 9800.00, None, "USD", "active", "2021-11-30", "2025-09-14"),
            ("ACC012", "C007", "credit_card", "****2212", None, -3200.00, 15000.0, "USD", "active", "2021-11-30", "2025-09-13"),
            ("ACC013", "C008", "checking", "****5533", "123006800", 7450.00, None, "USD", "active", "2022-05-18", "2025-09-10"),
            ("ACC014", "C009", "checking", "****8844", "064000017", 18900.00, None, "USD", "active", "2020-02-14", "2025-09-15"),
            ("ACC015", "C009", "savings", "****8845", "064000017", 95000.00, None, "USD", "active", "2020-02-14", "2025-06-01"),
            ("ACC016", "C010", "checking", "****1122", "061000052", 11200.00, None, "USD", "active", "2023-08-01", "2025-09-14"),
            ("ACC017", "C010", "credit_card", "****1123", None, -1800.00, 8000.0, "USD", "active", "2023-08-01", "2025-09-12"),
            # Suspicious customers
            ("ACC018", "C011", "checking", "****4455", "021000021", 45000.00, None, "USD", "active", "2024-01-05", "2025-09-15"),
            ("ACC019", "C012", "checking", "****7788", "122105155", 3200.00, None, "USD", "active", "2023-06-10", "2025-09-15"),
            ("ACC020", "C012", "credit_card", "****7789", None, -4800.00, 5000.0, "USD", "active", "2023-06-10", "2025-09-14"),
            ("ACC021", "C013", "checking", "****3366", "111000025", 78000.00, None, "USD", "active", "2024-06-01", "2025-09-15"),
            ("ACC022", "C014", "checking", "****9911", "122105155", 28000.00, None, "USD", "active", "2023-12-15", "2025-09-14"),
            ("ACC023", "C015", "checking", "****2244", "121042882", 16500.00, None, "USD", "active", "2024-02-20", "2025-09-15"),
            # High-value customers
            ("ACC024", "C016", "checking", "****5566", "021000021", 520000.00, None, "USD", "active", "2018-05-01", "2025-09-15"),
            ("ACC025", "C016", "savings", "****5567", "021000021", 1250000.00, None, "USD", "active", "2018-05-01", "2025-09-01"),
            ("ACC026", "C017", "checking", "****7799", "071000013", 340000.00, None, "USD", "active", "2019-01-15", "2025-09-15"),
            ("ACC027", "C017", "business", "****7800", "071000013", 890000.00, None, "USD", "active", "2019-01-15", "2025-09-10"),
            ("ACC028", "C018", "checking", "****3388", "121042882", 275000.00, None, "USD", "active", "2017-11-20", "2025-09-15"),
            ("ACC029", "C018", "credit_card", "****3389", None, -12500.00, 100000.0, "USD", "active", "2017-11-20", "2025-09-14"),
            # Locked/compromised
            ("ACC030", "C019", "checking", "****8822", "111000025", 8200.00, None, "USD", "locked", "2022-08-10", "2025-09-01"),
            ("ACC031", "C020", "checking", "****1144", "121042882", 6100.00, None, "USD", "suspended", "2023-04-25", "2025-08-28"),
            ("ACC032", "C020", "credit_card", "****1145", None, -950.00, 5000.0, "USD", "suspended", "2023-04-25", "2025-08-20"),
        ]

        await db.executemany(
            "INSERT INTO accounts (account_id, customer_id, account_type, account_number, routing_number, balance, credit_limit, currency, status, opened_date, last_activity_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            accounts,
        )

        # ============================================
        # TRANSACTIONS (sample - covering diverse patterns)
        # ============================================
        transactions = [
            # Clean customer transactions
            ("TXN001", "ACC001", "C001", "purchase", 45.99, "USD", "Whole Foods", "grocery", "Weekly groceries", "completed", "in_store", "192.168.1.10", "fp-abc001", "Austin", "US", "none", "2025-09-10", "2025-09-10"),
            ("TXN002", "ACC001", "C001", "purchase", 1299.99, "USD", "Best Buy", "electronics", "Laptop purchase", "completed", "online", "192.168.1.10", "fp-abc001", "Austin", "US", "none", "2025-08-15", "2025-08-16"),
            ("TXN003", "ACC001", "C001", "purchase", 67.50, "USD", "Shell Gas", "fuel", "Gas station", "completed", "in_store", "192.168.1.10", "fp-abc001", "Austin", "US", "none", "2025-09-08", "2025-09-08"),
            ("TXN004", "ACC004", "C002", "purchase", 250.00, "USD", "Nordstrom", "clothing", "Fall collection", "completed", "online", "10.0.0.15", "fp-def002", "Miami", "US", "none", "2025-09-01", "2025-09-02"),
            ("TXN005", "ACC004", "C002", "purchase", 89.99, "USD", "Amazon", "electronics", "Wireless earbuds", "completed", "online", "10.0.0.15", "fp-def002", "Miami", "US", "none", "2025-08-20", "2025-08-21"),
            ("TXN006", "ACC005", "C003", "purchase", 3500.00, "USD", "Apple Store", "electronics", "MacBook Pro", "completed", "in_store", "172.16.0.5", "fp-ghi003", "San Francisco", "US", "none", "2025-07-10", "2025-07-10"),
            ("TXN007", "ACC006", "C003", "purchase", 150.00, "USD", "Uber Eats", "restaurant", "Food delivery", "completed", "online", "172.16.0.5", "fp-ghi003", "San Francisco", "US", "none", "2025-09-12", "2025-09-12"),
            ("TXN008", "ACC007", "C004", "purchase", 420.00, "USD", "Delta Airlines", "travel", "Flight booking", "completed", "online", "192.168.2.20", "fp-jkl004", "Chicago", "US", "none", "2025-08-01", "2025-08-02"),
            ("TXN009", "ACC008", "C005", "purchase", 85.00, "USD", "Target", "retail", "Household items", "completed", "in_store", "10.10.0.8", "fp-mno005", "Denver", "US", "none", "2025-09-05", "2025-09-05"),
            ("TXN010", "ACC010", "C006", "purchase", 199.99, "USD", "REI", "sporting_goods", "Hiking gear", "completed", "online", "192.168.3.30", "fp-pqr006", "Seattle", "US", "none", "2025-08-25", "2025-08-26"),
            ("TXN011", "ACC011", "C007", "purchase", 550.00, "USD", "Marriott Hotels", "lodging", "Hotel stay", "completed", "online", "10.20.0.12", "fp-stu007", "Boston", "US", "none", "2025-07-20", "2025-07-21"),
            ("TXN012", "ACC012", "C007", "purchase", 75.00, "USD", "Grubhub", "restaurant", "Dinner delivery", "completed", "online", "10.20.0.12", "fp-stu007", "Boston", "US", "none", "2025-09-11", "2025-09-11"),
            ("TXN013", "ACC014", "C009", "purchase", 2100.00, "USD", "Home Depot", "home_improvement", "Bathroom renovation supplies", "completed", "in_store", "192.168.5.50", "fp-vwx009", "Nashville", "US", "none", "2025-06-15", "2025-06-15"),
            ("TXN014", "ACC016", "C010", "purchase", 320.00, "USD", "Anthropologie", "clothing", "Dress purchase", "completed", "online", "10.30.0.18", "fp-yza010", "Atlanta", "US", "none", "2025-09-03", "2025-09-04"),
            # Suspicious customer transactions
            ("TXN015", "ACC018", "C011", "purchase", 9800.00, "USD", "Luxury Watches Inc", "jewelry", "Watch purchase", "completed", "online", "45.67.89.10", "fp-sus011", "New York", "US", "medium", "2025-09-14", "2025-09-14"),
            ("TXN016", "ACC018", "C011", "transfer", 9900.00, "USD", None, "transfer", "Wire to overseas", "completed", "wire", "45.67.89.10", "fp-sus011", "New York", "US", "high", "2025-09-13", "2025-09-14"),
            ("TXN017", "ACC018", "C011", "transfer", 9850.00, "USD", None, "transfer", "Wire to overseas", "completed", "wire", "45.67.89.10", "fp-sus011", "Moscow", "RU", "high", "2025-09-12", "2025-09-13"),
            ("TXN018", "ACC018", "C011", "withdrawal", 9700.00, "USD", None, "atm", "ATM withdrawal", "completed", "atm", "45.67.89.10", "fp-sus011", "New York", "US", "high", "2025-09-11", "2025-09-11"),
            # Amanda Reed - serial refunder
            ("TXN019", "ACC019", "C012", "purchase", 199.99, "USD", "Amazon", "electronics", "Bluetooth speaker", "completed", "online", "98.76.54.32", "fp-sus012", "Las Vegas", "US", "low", "2025-08-01", "2025-08-02"),
            ("TXN020", "ACC019", "C012", "refund", -199.99, "USD", "Amazon", "electronics", "Refund - speaker", "completed", "online", "98.76.54.32", "fp-sus012", "Las Vegas", "US", "medium", "2025-08-10", "2025-08-11"),
            ("TXN021", "ACC019", "C012", "purchase", 349.99, "USD", "Amazon", "electronics", "Noise cancelling headphones", "completed", "online", "98.76.54.32", "fp-sus012", "Las Vegas", "US", "low", "2025-08-15", "2025-08-16"),
            ("TXN022", "ACC019", "C012", "refund", -349.99, "USD", "Amazon", "electronics", "Refund - headphones", "completed", "online", "98.76.54.32", "fp-sus012", "Las Vegas", "US", "medium", "2025-08-22", "2025-08-23"),
            ("TXN023", "ACC019", "C012", "purchase", 499.99, "USD", "Best Buy", "electronics", "Tablet", "completed", "online", "98.76.54.32", "fp-sus012", "Las Vegas", "US", "low", "2025-09-01", "2025-09-02"),
            ("TXN024", "ACC020", "C012", "purchase", 899.00, "USD", "Apple Store", "electronics", "iPhone", "completed", "online", "98.76.54.32", "fp-sus012", "Las Vegas", "US", "medium", "2025-09-05", "2025-09-06"),
            # Carlos Mendez - structuring pattern
            ("TXN025", "ACC021", "C013", "deposit", 9500.00, "USD", None, "deposit", "Cash deposit", "completed", "in_store", "11.22.33.44", "fp-sus013", "Houston", "US", "high", "2025-09-01", "2025-09-01"),
            ("TXN026", "ACC021", "C013", "deposit", 9200.00, "USD", None, "deposit", "Cash deposit", "completed", "in_store", "11.22.33.44", "fp-sus013", "Houston", "US", "high", "2025-09-03", "2025-09-03"),
            ("TXN027", "ACC021", "C013", "deposit", 9800.00, "USD", None, "deposit", "Cash deposit", "completed", "in_store", "11.22.33.44", "fp-sus013", "Houston", "US", "high", "2025-09-05", "2025-09-05"),
            ("TXN028", "ACC021", "C013", "deposit", 9100.00, "USD", None, "deposit", "Cash deposit", "completed", "in_store", "11.22.33.44", "fp-sus013", "Houston", "US", "high", "2025-09-08", "2025-09-08"),
            ("TXN029", "ACC021", "C013", "transfer", 35000.00, "USD", None, "transfer", "Wire overseas", "completed", "wire", "11.22.33.44", "fp-sus013", "Houston", "US", "critical", "2025-09-09", "2025-09-10"),
            # Geographic anomaly - Diana Volkov
            ("TXN030", "ACC022", "C014", "purchase", 450.00, "USD", "Saks Fifth Avenue", "clothing", "Designer bag", "completed", "in_store", "55.66.77.88", "fp-sus014", "Phoenix", "US", "none", "2025-09-14T10:00:00", "2025-09-14"),
            ("TXN031", "ACC022", "C014", "purchase", 1200.00, "USD", "Harrods", "clothing", "Luxury goods", "completed", "in_store", "88.77.66.55", "fp-sus014b", "London", "GB", "high", "2025-09-14T16:00:00", "2025-09-14"),
            # Rapid velocity - Frank Nguyen
            ("TXN032", "ACC023", "C015", "purchase", 150.00, "USD", "Gas Station A", "fuel", "Fuel", "completed", "in_store", "22.33.44.55", "fp-sus015", "San Diego", "US", "low", "2025-09-15T08:00:00", "2025-09-15"),
            ("TXN033", "ACC023", "C015", "purchase", 200.00, "USD", "Electronics Store", "electronics", "Accessories", "completed", "in_store", "22.33.44.55", "fp-sus015", "San Diego", "US", "low", "2025-09-15T08:15:00", "2025-09-15"),
            ("TXN034", "ACC023", "C015", "purchase", 180.00, "USD", "Gift Cards Plus", "retail", "Gift cards", "completed", "in_store", "22.33.44.55", "fp-sus015", "San Diego", "US", "medium", "2025-09-15T08:25:00", "2025-09-15"),
            ("TXN035", "ACC023", "C015", "purchase", 250.00, "USD", "Jewelry Mart", "jewelry", "Jewelry", "completed", "in_store", "22.33.44.55", "fp-sus015", "San Diego", "US", "medium", "2025-09-15T08:35:00", "2025-09-15"),
            ("TXN036", "ACC023", "C015", "purchase", 175.00, "USD", "Liquor Warehouse", "retail", "Spirits", "completed", "in_store", "22.33.44.55", "fp-sus015", "San Diego", "US", "medium", "2025-09-15T08:45:00", "2025-09-15"),
            # High-value transactions
            ("TXN037", "ACC024", "C016", "transfer", 50000.00, "USD", None, "transfer", "Investment transfer", "completed", "wire", "10.0.1.1", "fp-hv016", "New York", "US", "none", "2025-09-01", "2025-09-02"),
            ("TXN038", "ACC026", "C017", "transfer", 75000.00, "USD", None, "transfer", "Business payment", "completed", "wire", "10.0.2.2", "fp-hv017", "Chicago", "US", "none", "2025-08-15", "2025-08-16"),
            ("TXN039", "ACC028", "C018", "purchase", 8500.00, "USD", "Tiffany & Co", "jewelry", "Anniversary gift", "completed", "in_store", "10.0.3.3", "fp-hv018", "San Francisco", "US", "none", "2025-09-10", "2025-09-10"),
            ("TXN040", "ACC029", "C018", "purchase", 4200.00, "USD", "Four Seasons", "lodging", "Vacation stay", "completed", "online", "10.0.3.3", "fp-hv018", "San Francisco", "US", "none", "2025-08-20", "2025-08-21"),
            # Compromised account transactions
            ("TXN041", "ACC030", "C019", "purchase", 2500.00, "USD", "Unknown Merchant", "electronics", "Unauthorized purchase", "flagged", "online", "99.88.77.66", "fp-unk999", "Lagos", "NG", "critical", "2025-09-01", None),
            ("TXN042", "ACC030", "C019", "transfer", 5000.00, "USD", None, "transfer", "Unauthorized transfer", "flagged", "online", "99.88.77.66", "fp-unk999", "Lagos", "NG", "critical", "2025-09-01", None),
            ("TXN043", "ACC031", "C020", "purchase", 1800.00, "USD", "Crypto Exchange", "crypto", "Unauthorized crypto buy", "flagged", "online", "88.77.66.55", "fp-unk998", "Minsk", "BY", "critical", "2025-08-28", None),
        ]

        await db.executemany(
            "INSERT INTO transactions (transaction_id, account_id, customer_id, transaction_type, amount, currency, merchant_name, merchant_category, description, status, channel, ip_address, device_fingerprint, location_city, location_country, risk_flag, created_at, settled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            transactions,
        )

        # ============================================
        # ORDERS & ORDER ITEMS (for refund agent)
        # ============================================
        orders = [
            ("ORD-001", "C001", 1299.99, "2025-08-10", "delivered", "UPS", "1Z999AA10123456784", "2025-08-15"),
            ("ORD-002", "C001", 45.99, "2025-09-05", "delivered", "USPS", "9400111899223100001", "2025-09-08"),
            ("ORD-003", "C002", 250.00, "2025-08-28", "delivered", "FedEx", "794644790132", "2025-09-01"),
            ("ORD-004", "C002", 89.99, "2025-08-18", "delivered", "USPS", "9400111899223100002", "2025-08-20"),
            ("ORD-005", "C004", 420.00, "2025-07-28", "delivered", "N/A", "N/A", "2025-08-01"),
            ("ORD-006", "C006", 199.99, "2025-08-22", "delivered", "UPS", "1Z999AA10123456785", "2025-08-25"),
            ("ORD-007", "C012", 199.99, "2025-07-28", "returned", "USPS", "9400111899223100003", "2025-08-01"),
            ("ORD-008", "C012", 349.99, "2025-08-12", "returned", "UPS", "1Z999AA10123456786", "2025-08-15"),
            ("ORD-009", "C012", 499.99, "2025-08-28", "delivered", "FedEx", "794644790133", "2025-09-01"),
            ("ORD-010", "C012", 899.00, "2025-09-02", "delivered", "UPS", "1Z999AA10123456787", "2025-09-05"),
            ("ORD-011", "C003", 3500.00, "2025-07-05", "delivered", "Apple", "APL-SHIP-001", "2025-07-10"),
            ("ORD-012", "C009", 2100.00, "2025-06-10", "delivered", "Home Depot", "HD-SHIP-001", "2025-06-15"),
            ("ORD-013", "C010", 320.00, "2025-08-30", "delivered", "FedEx", "794644790134", "2025-09-03"),
            ("ORD-014", "C005", 85.00, "2025-09-01", "delivered", "USPS", "9400111899223100004", "2025-09-05"),
            ("ORD-015", "C007", 550.00, "2025-07-15", "delivered", "Marriott", "N/A", "2025-07-20"),
        ]

        await db.executemany(
            "INSERT INTO orders (order_id, customer_id, order_total, order_date, status, shipping_carrier, tracking_number, delivery_date) VALUES (?,?,?,?,?,?,?,?)",
            orders,
        )

        order_items = [
            ("ITEM-001", "ORD-001", "Laptop - Dell XPS 15", "SKU-DELL-XPS15", 1, 1299.99, "electronics"),
            ("ITEM-002", "ORD-002", "Organic Avocados (6pk)", "SKU-AVO-6PK", 1, 12.99, "food"),
            ("ITEM-003", "ORD-002", "Almond Milk", "SKU-ALM-MLK", 2, 6.50, "food"),
            ("ITEM-004", "ORD-002", "Quinoa 2lb", "SKU-QNA-2LB", 1, 8.99, "food"),
            ("ITEM-005", "ORD-002", "Mixed Nuts", "SKU-MXD-NTS", 1, 11.01, "food"),
            ("ITEM-006", "ORD-003", "Cashmere Sweater", "SKU-CSH-SWT", 1, 250.00, "clothing"),
            ("ITEM-007", "ORD-004", "Wireless Earbuds", "SKU-WRL-EBD", 1, 89.99, "electronics"),
            ("ITEM-008", "ORD-005", "Delta Airline Ticket", "SKU-DLT-TKT", 1, 420.00, "travel"),
            ("ITEM-009", "ORD-006", "Hiking Boots", "SKU-HK-BTS", 1, 199.99, "sporting_goods"),
            ("ITEM-010", "ORD-007", "Bluetooth Speaker", "SKU-BT-SPK", 1, 199.99, "electronics"),
            ("ITEM-011", "ORD-008", "Noise Cancelling Headphones", "SKU-NC-HP", 1, 349.99, "electronics"),
            ("ITEM-012", "ORD-009", "Tablet - iPad Air", "SKU-IPD-AIR", 1, 499.99, "electronics"),
            ("ITEM-013", "ORD-010", "iPhone 15 Pro", "SKU-IPH-15P", 1, 899.00, "electronics"),
            ("ITEM-014", "ORD-011", "MacBook Pro 16in", "SKU-MBP-16", 1, 3500.00, "electronics"),
            ("ITEM-015", "ORD-012", "Bathroom Tile Set", "SKU-BTH-TIL", 1, 1200.00, "home_improvement"),
            ("ITEM-016", "ORD-012", "Vanity Cabinet", "SKU-VAN-CAB", 1, 900.00, "home_improvement"),
            ("ITEM-017", "ORD-013", "Linen Dress", "SKU-LIN-DRS", 1, 320.00, "clothing"),
            ("ITEM-018", "ORD-014", "Household Essentials Bundle", "SKU-HSE-BDL", 1, 85.00, "retail"),
            ("ITEM-019", "ORD-015", "Hotel Room - 2 nights", "SKU-HTL-2NT", 1, 550.00, "lodging"),
        ]

        await db.executemany(
            "INSERT INTO order_items (item_id, order_id, product_name, product_sku, quantity, unit_price, category) VALUES (?,?,?,?,?,?,?)",
            order_items,
        )

        # Refund policy rules
        refund_policies = [
            ("RP-001", "electronics", 30, 1, 25.0, 15.0),
            ("RP-002", "clothing", 60, 1, 25.0, 0.0),
            ("RP-003", "food", 7, 0, 10.0, 0.0),
            ("RP-004", "digital", 0, 0, 0.0, 0.0),
            ("RP-005", "default", 30, 1, 25.0, 10.0),
            ("RP-006", "sporting_goods", 45, 1, 25.0, 10.0),
            ("RP-007", "home_improvement", 30, 1, 25.0, 20.0),
            ("RP-008", "travel", 0, 0, 0.0, 0.0),
            ("RP-009", "lodging", 14, 0, 0.0, 0.0),
        ]

        await db.executemany(
            "INSERT INTO refund_policy (policy_id, category, max_refund_days, requires_return, max_no_receipt_amount, restocking_fee_pct) VALUES (?,?,?,?,?,?)",
            refund_policies,
        )

        # Existing refund requests
        refund_requests = [
            ("REF-001", "ORD-007", "C012", 199.99, "Item defective", "completed", None, "Refund processed", "2025-08-05", "2025-08-07"),
            ("REF-002", "ORD-008", "C012", 349.99, "Changed my mind", "completed", None, "Return received, refund processed", "2025-08-18", "2025-08-22"),
            ("REF-003", "ORD-009", "C012", 499.99, "Item not as described", "pending", None, None, "2025-09-10", None),
            ("REF-004", "ORD-005", "C004", 420.00, "Flight cancelled", "denied", "non_refundable_category", "Travel items non-refundable", "2025-08-10", "2025-08-10"),
            ("REF-005", "ORD-001", "C001", 1299.99, "Laptop overheating", "escalated", None, "Escalated to supervisor - high value item", "2025-09-12", None),
        ]

        await db.executemany(
            "INSERT INTO refund_requests (refund_id, order_id, customer_id, amount, reason, status, policy_violation, agent_notes, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            refund_requests,
        )

        # ============================================
        # INSURANCE POLICIES & CLAIMS
        # ============================================
        insurance_policies = [
            ("INS-001", "C001", "auto", "POL-AUTO-10001", 150.00, 500.00, 50000.00, "2024-01-01", "2025-12-31", "active"),
            ("INS-002", "C001", "home", "POL-HOME-10001", 200.00, 1000.00, 300000.00, "2024-01-01", "2025-12-31", "active"),
            ("INS-003", "C002", "auto", "POL-AUTO-10002", 180.00, 750.00, 40000.00, "2024-06-01", "2025-05-31", "active"),
            ("INS-004", "C003", "health", "POL-HLTH-10003", 350.00, 2000.00, 500000.00, "2024-01-01", "2025-12-31", "active"),
            ("INS-005", "C005", "auto", "POL-AUTO-10005", 120.00, 500.00, 35000.00, "2024-03-01", "2025-02-28", "active"),
            ("INS-006", "C007", "home", "POL-HOME-10007", 250.00, 1500.00, 400000.00, "2024-07-01", "2025-06-30", "active"),
            ("INS-007", "C009", "auto", "POL-AUTO-10009", 160.00, 500.00, 45000.00, "2024-01-01", "2025-12-31", "active"),
            ("INS-008", "C011", "auto", "POL-AUTO-10011", 300.00, 250.00, 60000.00, "2024-09-01", "2025-08-31", "active"),
            ("INS-009", "C016", "home", "POL-HOME-10016", 500.00, 5000.00, 2000000.00, "2024-01-01", "2025-12-31", "active"),
            ("INS-010", "C014", "auto", "POL-AUTO-10014", 220.00, 500.00, 50000.00, "2024-06-01", "2025-05-31", "active"),
        ]

        await db.executemany(
            "INSERT INTO insurance_policies (policy_id, customer_id, policy_type, policy_number, premium_monthly, deductible, coverage_limit, start_date, end_date, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            insurance_policies,
        )

        insurance_claims = [
            ("CLM-001", "INS-001", "C001", "collision", "2025-06-15", "Rear-ended at stoplight. Bumper and taillight damage.", 4500.00, 4000.00, "approved", "Deductible applied. Repair estimate verified.", '["police_report.pdf","repair_estimate.pdf"]', "2025-06-16"),
            ("CLM-002", "INS-002", "C001", "water_damage", "2025-03-20", "Pipe burst in basement. Flooring and drywall damaged.", 15000.00, 14000.00, "approved", "Deductible applied. Contractor estimate verified.", '["photos.zip","contractor_estimate.pdf"]', "2025-03-21"),
            ("CLM-003", "INS-003", "C002", "theft", "2025-08-10", "Car stolen from parking garage.", 22000.00, None, "under_review", "Investigating. Police report filed.", '["police_report.pdf"]', "2025-08-11"),
            ("CLM-004", "INS-005", "C005", "collision", "2025-05-01", "Hit a deer on highway. Front-end damage.", 8000.00, None, "denied", "Policy lapsed at time of incident. Premium not paid for 2 months.", '["photos.zip"]', "2025-05-02"),
            ("CLM-005", "INS-008", "C011", "collision", "2025-09-10", "Multiple vehicle collision on highway.", 45000.00, None, "under_review", "Suspicious - high claim amount, new policy.", '["police_report.pdf","medical_records.pdf"]', "2025-09-11"),
            ("CLM-006", "INS-008", "C011", "theft", "2025-07-20", "Claimed catalytic converter theft.", 3000.00, None, "fraud_flagged", "Same customer filed 2 claims in 3 months. Investigation opened.", '["photos.zip"]', "2025-07-21"),
            ("CLM-007", "INS-006", "C007", "water_damage", "2025-08-15", "Dishwasher leak damaged kitchen floor.", 5000.00, 3500.00, "paid", "Deductible applied. Repair completed.", '["photos.zip","receipt.pdf"]', "2025-08-16"),
            ("CLM-008", "INS-010", "C014", "collision", "2025-09-14", "Collision in parking lot. Minor scrapes.", 2000.00, None, "submitted", "Awaiting adjuster review.", '["photos.zip"]', "2025-09-14"),
        ]

        await db.executemany(
            "INSERT INTO insurance_claims (claim_id, policy_id, customer_id, claim_type, incident_date, incident_description, claimed_amount, approved_amount, status, adjuster_notes, supporting_docs, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            insurance_claims,
        )

        # ============================================
        # LOAN APPLICATIONS & CREDIT REPORTS
        # ============================================
        loan_applications = [
            ("LOAN-001", "C001", "personal", 15000.00, 36, "Home renovation", 85000.00, "employed", "Tech Corp", 5.0, 720, 0.28, None, None, "approved", "Good credit, stable employment", 15000.00, 7.5, "2025-07-01"),
            ("LOAN-002", "C002", "auto", 25000.00, 60, "New car purchase", 62000.00, "employed", "Healthcare Inc", 3.0, 695, 0.32, "vehicle", 30000.00, "approved", "Adequate DTI, collateral provided", 25000.00, 8.9, "2025-08-15"),
            ("LOAN-003", "C003", "mortgage", 500000.00, 360, "Primary residence", 180000.00, "employed", "Finance LLC", 12.0, 780, 0.22, "property", 650000.00, "under_review", None, None, None, "2025-09-01"),
            ("LOAN-004", "C011", "personal", 50000.00, 24, "Business investment", 95000.00, "self_employed", "Self", 2.0, 640, 0.45, None, None, "denied", "DTI exceeds limit, insufficient credit history", None, None, "2025-08-20"),
            ("LOAN-005", "C013", "business", 200000.00, 60, "Import/export startup", 120000.00, "self_employed", "Mendez Trading", 1.0, 580, 0.55, None, None, "denied", "Credit score below threshold, high DTI", None, None, "2025-09-05"),
            ("LOAN-006", "C016", "mortgage", 800000.00, 360, "Investment property", 450000.00, "employed", "Whitmore Capital", 20.0, 810, 0.15, "property", 1200000.00, "approved", "Excellent credit, low DTI, high collateral", 800000.00, 5.5, "2025-06-15"),
            ("LOAN-007", "C009", "personal", 10000.00, 24, "Debt consolidation", 72000.00, "employed", "Construction Co", 8.0, 680, 0.38, None, None, "submitted", None, None, None, "2025-09-12"),
            ("LOAN-008", "C015", "auto", 35000.00, 48, "Used car", 55000.00, "employed", "Restaurant Group", 2.0, 620, 0.42, "vehicle", 28000.00, "counter_offered", "Offered reduced amount with higher rate", 20000.00, 12.5, "2025-09-08"),
        ]

        await db.executemany(
            "INSERT INTO loan_applications (application_id, customer_id, loan_type, requested_amount, term_months, purpose, annual_income, employment_status, employer_name, years_employed, credit_score, debt_to_income_ratio, collateral_type, collateral_value, status, decision_reason, approved_amount, approved_rate, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            loan_applications,
        )

        credit_reports = [
            ("CR-001", "C001", "equifax", 720, 12, 8, 0, 45000.00, 0.22, 0, 0, 1, "2025-07-01"),
            ("CR-002", "C001", "experian", 715, 12, 8, 0, 44500.00, 0.21, 0, 0, 1, "2025-07-01"),
            ("CR-003", "C002", "equifax", 695, 8, 6, 1, 32000.00, 0.35, 0, 0, 2, "2025-08-10"),
            ("CR-004", "C003", "transunion", 780, 15, 10, 0, 28000.00, 0.18, 0, 0, 0, "2025-09-01"),
            ("CR-005", "C011", "equifax", 640, 5, 4, 2, 55000.00, 0.48, 0, 1, 3, "2025-08-20"),
            ("CR-006", "C013", "experian", 580, 3, 3, 1, 68000.00, 0.55, 1, 2, 4, "2025-09-05"),
            ("CR-007", "C016", "transunion", 810, 20, 12, 0, 120000.00, 0.08, 0, 0, 0, "2025-06-10"),
            ("CR-008", "C009", "equifax", 680, 10, 7, 1, 38000.00, 0.34, 0, 0, 2, "2025-09-10"),
            ("CR-009", "C015", "experian", 620, 6, 5, 2, 42000.00, 0.45, 0, 1, 3, "2025-09-05"),
        ]

        await db.executemany(
            "INSERT INTO credit_reports (report_id, customer_id, bureau, credit_score, total_accounts, open_accounts, delinquent_accounts, total_balance, credit_utilization, bankruptcies, collections, hard_inquiries_12m, report_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            credit_reports,
        )

        # ============================================
        # KYC VERIFICATIONS & WATCHLIST
        # ============================================
        kyc_verifications = [
            ("KYC-001", "C001", "identity", "drivers_license", "DL-TX-88412", "passed", 0.98, "[]", "system", "2022-01-10"),
            ("KYC-002", "C002", "identity", "passport", "P-US-992341", "passed", 0.97, "[]", "system", "2021-06-15"),
            ("KYC-003", "C003", "identity", "drivers_license", "DL-CA-55123", "passed", 0.96, "[]", "system", "2020-09-01"),
            ("KYC-004", "C011", "identity", "passport", "P-RU-123456", "passed", 0.85, '["country_risk:high"]', "analyst_jones", "2024-01-05"),
            ("KYC-005", "C011", "pep_screening", None, None, "manual_review", 0.72, '["potential_pep_match"]', None, "2024-01-06"),
            ("KYC-006", "C013", "identity", "passport", "P-MX-554433", "pending", None, "[]", None, "2024-06-01"),
            ("KYC-007", "C013", "sanctions", None, None, "pending", None, "[]", None, "2024-06-01"),
            ("KYC-008", "C014", "identity", "passport", "P-UA-887766", "passed", 0.90, '["name_variant_detected"]', "analyst_smith", "2023-12-15"),
            ("KYC-009", "C016", "identity", "passport", "P-US-112233", "passed", 0.99, "[]", "system", "2018-05-01"),
            ("KYC-010", "C016", "income", None, None, "passed", 0.95, "[]", "analyst_jones", "2018-05-02"),
            ("KYC-011", "C019", "identity", "drivers_license", "DL-TX-44556", "passed", 0.94, "[]", "system", "2022-08-10"),
            ("KYC-012", "C020", "identity", "state_id", "SI-CA-33221", "passed", 0.92, "[]", "system", "2023-04-25"),
        ]

        await db.executemany(
            "INSERT INTO kyc_verifications (verification_id, customer_id, verification_type, document_type, document_number, verification_result, confidence_score, flags, verified_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            kyc_verifications,
        )

        watchlist_entries = [
            ("WL-001", "ofac_sdn", "Viktor Petrov", '["V. Petrov","Petrov Viktor"]', "RU", 0.85, 1),
            ("WL-002", "ofac_sdn", "Ahmad Al-Rashid", '["A. Al-Rashid"]', "SY", 0.90, 1),
            ("WL-003", "ofac_sdn", "Kim Jong-pil", '["Kim J.P."]', "KP", 0.95, 1),
            ("WL-004", "pep", "Carlos Mendez Rodriguez", '["C. Mendez","Carlos M. Rodriguez"]', "MX", 0.80, 1),
            ("WL-005", "pep", "Diana Volkov-Petrov", '["D. Volkov","Diana Petrov"]', "UA", 0.80, 1),
            ("WL-006", "sanctions", "Petrograd Trade LLC", '["Petrograd Trading"]', "RU", 0.90, 1),
            ("WL-007", "sanctions", "Tehran Industrial Corp", '["TIC","Tehran Industrial"]', "IR", 0.90, 1),
            ("WL-008", "adverse_media", "Frank Nguyen-Tran", '["F. Nguyen","Frank Tran"]', "US", 0.75, 1),
            ("WL-009", "ofac_sdn", "Ali Hassan Mohamed", '["A. Hassan","Ali Mohamed"]', "SD", 0.90, 1),
            ("WL-010", "sanctions", "Havana Imports Co", '["Havana Trading"]', "CU", 0.90, 1),
            ("WL-011", "pep", "Sergei Volkov", '["S. Volkov"]', "RU", 0.80, 1),
            ("WL-012", "ofac_sdn", "Pyongyang Electronics", '["PE Corp"]', "KP", 0.95, 1),
            ("WL-013", "adverse_media", "Amanda Reed-Lawson", '["A. Reed","Amanda Lawson"]', "US", 0.70, 1),
            ("WL-014", "sanctions", "Crimea Shipping LLC", '["CS LLC"]', "RU", 0.90, 1),
            ("WL-015", "pep", "Elizabeth Whitmore-Ashford", '["E. Whitmore","Beth Ashford"]', "US", 0.75, 1),
            ("WL-016", "ofac_sdn", "Banco Nacional de Cuba", '["BNC"]', "CU", 0.95, 1),
            ("WL-017", "sanctions", "Damascus Steel Works", '["DSW","Damascus SW"]', "SY", 0.90, 1),
            ("WL-018", "pep", "Park Jae-sung", '["J. Park","Jae Park"]', "KR", 0.80, 1),
            ("WL-019", "adverse_media", "Rachel Kim-Santos", '["R. Kim","Rachel Santos"]', "US", 0.70, 1),
            ("WL-020", "ofac_sdn", "Minsk Commodity Exchange", '["MCE"]', "BY", 0.90, 1),
        ]

        await db.executemany(
            "INSERT INTO watchlist_entries (entry_id, list_type, entity_name, entity_aliases, entity_country, match_threshold, active) VALUES (?,?,?,?,?,?,?)",
            watchlist_entries,
        )

        # ============================================
        # ALERTS & MONITORING RULES
        # ============================================
        alerts = [
            ("ALT-001", "C011", "ACC018", "amount_threshold", "high", "RULE-001", '{"threshold":9000,"amount":9800}', '["TXN015"]', "open", None, "2025-09-14"),
            ("ALT-002", "C011", "ACC018", "velocity", "high", "RULE-002", '{"window_hours":72,"count":3,"threshold":2}', '["TXN016","TXN017","TXN018"]', "open", None, "2025-09-13"),
            ("ALT-003", "C013", "ACC021", "structuring", "critical", "RULE-003", '{"pattern":"sub_10k_deposits","count":4,"total":37600}', '["TXN025","TXN026","TXN027","TXN028"]', "open", None, "2025-09-08"),
            ("ALT-004", "C014", "ACC022", "geographic", "high", "RULE-004", '{"city1":"Phoenix","city2":"London","hours_between":6}', '["TXN030","TXN031"]', "investigating", "Impossible travel detected - Phoenix to London in 6 hours", "2025-09-14"),
            ("ALT-005", "C015", "ACC023", "velocity", "medium", "RULE-002", '{"window_minutes":60,"count":5,"threshold":3}', '["TXN032","TXN033","TXN034","TXN035","TXN036"]', "open", None, "2025-09-15"),
            ("ALT-006", "C019", "ACC030", "pattern", "critical", "RULE-005", '{"pattern":"compromised_account","indicators":["foreign_ip","unknown_device"]}', '["TXN041","TXN042"]', "escalated", "Account locked pending investigation", "2025-09-01"),
        ]

        await db.executemany(
            "INSERT INTO alerts (alert_id, customer_id, account_id, alert_type, severity, trigger_rule, trigger_details, related_transactions, status, analyst_notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            alerts,
        )

        monitoring_rules = [
            ("RULE-001", "High Amount Single Transaction", "threshold", '{"amount_threshold":9000.0,"currency":"USD"}', "high", 1),
            ("RULE-002", "Transaction Velocity", "velocity", '{"max_count":3,"window_hours":24}', "medium", 1),
            ("RULE-003", "Structuring Detection", "pattern", '{"sub_threshold":10000,"min_deposits":3,"window_days":7}', "critical", 1),
            ("RULE-004", "Geographic Anomaly", "geo_anomaly", '{"max_travel_speed_kmh":900,"min_distance_km":500}', "high", 1),
            ("RULE-005", "Compromised Account Pattern", "pattern", '{"signals":["foreign_ip","unknown_device","rapid_transfers"]}', "critical", 1),
            ("RULE-006", "Round Amount Detection", "pattern", '{"tolerance_pct":1.0,"min_amount":1000}', "low", 1),
            ("RULE-007", "New Account High Activity", "velocity", '{"account_age_days":90,"max_daily_transactions":5}', "medium", 1),
            ("RULE-008", "Cross-Border Transfer Threshold", "threshold", '{"amount_threshold":50000.0,"cross_border":true}', "high", 1),
            ("RULE-009", "Cash Intensive Business", "pattern", '{"cash_ratio_threshold":0.8,"window_days":30}', "medium", 1),
            ("RULE-010", "Dormant Account Reactivation", "pattern", '{"dormancy_days":180,"reactivation_amount":5000}', "medium", 1),
        ]

        await db.executemany(
            "INSERT INTO monitoring_rules (rule_id, rule_name, rule_type, parameters, severity, active) VALUES (?,?,?,?,?,?)",
            monitoring_rules,
        )

        # ============================================
        # CHARGEBACKS
        # ============================================
        chargebacks = [
            ("CB-001", "TXN005", "C002", "ACC004", "10.4", "Other Fraud - Card Absent Environment", 89.99, None, None, "open", "2025-10-20", None, "2025-09-15"),
            ("CB-002", "TXN011", "C007", "ACC012", "13.1", "Merchandise/Services Not Received", 550.00, "Guest checked in and stayed two nights per hotel records", '["hotel_folio.pdf","check_in_log.pdf"]', "merchant_notified", "2025-10-05", None, "2025-08-25"),
            ("CB-003", "TXN006", "C003", "ACC006", "12.5", "Incorrect Amount", 500.00, None, None, "open", "2025-10-10", None, "2025-09-10"),
            ("CB-004", "TXN039", "C018", "ACC029", "10.4", "Other Fraud - Card Absent Environment", 8500.00, None, None, "evidence_submitted", "2025-11-10", None, "2025-09-14"),
            ("CB-005", "TXN014", "C010", "ACC017", "13.3", "Not as Described or Defective Merchandise", 320.00, "Item matches product listing. Return not attempted.", '["product_listing.pdf","shipping_confirmation.pdf"]', "representment", "2025-10-15", None, "2025-09-08"),
            ("CB-006", "TXN041", "C019", "ACC030", "10.1", "EMV Liability Shift Counterfeit Fraud", 2500.00, None, None, "open", "2025-10-15", None, "2025-09-05"),
            ("CB-007", "TXN009", "C005", "ACC008", "13.1", "Merchandise/Services Not Received", 85.00, "Delivery confirmed via USPS tracking", '["tracking_proof.pdf"]', "won", "2025-10-01", "merchant_favor", "2025-09-01"),
            ("CB-008", "TXN043", "C020", "ACC032", "10.4", "Other Fraud - Card Absent Environment", 1800.00, None, None, "open", "2025-10-28", None, "2025-09-10"),
        ]

        await db.executemany(
            "INSERT INTO chargebacks (chargeback_id, transaction_id, customer_id, account_id, reason_code, reason_description, disputed_amount, merchant_response, evidence_docs, status, deadline_date, outcome, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            chargebacks,
        )

        # ============================================
        # ACCOUNT RECOVERY DATA
        # ============================================
        recovery_requests = [
            ("REC-001", "C019", "ACC030", "compromised", "email_otp", "pending", "482917", "2025-09-02T12:00:00", 0, 3, "99.88.77.66", "Windows/Chrome", "pending", "2025-09-01"),
            ("REC-002", "C020", "ACC031", "compromised", "sms_otp", "pending", "739201", "2025-08-29T15:00:00", 1, 3, "88.77.66.55", "iPhone/Safari", "pending", "2025-08-28"),
            ("REC-003", "C019", "ACC030", "password_reset", "security_questions", "failed", None, None, 3, 3, "44.55.66.77", "Android/Chrome", "expired", "2025-08-25"),
            ("REC-004", "C007", "ACC011", "unlock", "email_otp", "verified", "551234", "2025-08-20T10:00:00", 1, 3, "10.20.0.12", "MacOS/Safari", "completed", "2025-08-20"),
            ("REC-005", "C004", "ACC007", "device_change", "sms_otp", "verified", "998877", "2025-09-10T14:00:00", 1, 3, "192.168.2.20", "iPhone/Safari", "completed", "2025-09-10"),
        ]

        await db.executemany(
            "INSERT INTO account_recovery_requests (request_id, customer_id, account_id, recovery_type, verification_method, verification_status, otp_code, otp_expires_at, attempts, max_attempts, ip_address, device_info, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            recovery_requests,
        )

        security_questions = [
            ("SQ-001", "C001", "What is your mother's maiden name?", "hash_williams"),
            ("SQ-002", "C001", "What was the name of your first pet?", "hash_buddy"),
            ("SQ-003", "C002", "What city were you born in?", "hash_miami"),
            ("SQ-004", "C002", "What is your favorite movie?", "hash_inception"),
            ("SQ-005", "C003", "What high school did you attend?", "hash_lincoln"),
            ("SQ-006", "C003", "What is your mother's maiden name?", "hash_wong"),
            ("SQ-007", "C019", "What is your mother's maiden name?", "hash_lee"),
            ("SQ-008", "C019", "What was your first car?", "hash_civic"),
            ("SQ-009", "C020", "What city were you born in?", "hash_seoul"),
            ("SQ-010", "C020", "What is your favorite book?", "hash_gatsby"),
            ("SQ-011", "C004", "What is your mother's maiden name?", "hash_morgan"),
            ("SQ-012", "C004", "What was the name of your first pet?", "hash_max"),
            ("SQ-013", "C007", "What city were you born in?", "hash_boston"),
            ("SQ-014", "C007", "What is your favorite movie?", "hash_matrix"),
            ("SQ-015", "C016", "What high school did you attend?", "hash_exeter"),
            ("SQ-016", "C016", "What is your mother's maiden name?", "hash_ashford"),
            ("SQ-017", "C011", "What city were you born in?", "hash_moscow"),
            ("SQ-018", "C011", "What was your first car?", "hash_lada"),
            ("SQ-019", "C014", "What is your favorite movie?", "hash_stalker"),
            ("SQ-020", "C014", "What was the name of your first pet?", "hash_misha"),
        ]

        await db.executemany(
            "INSERT INTO security_questions (question_id, customer_id, question, answer_hash) VALUES (?,?,?,?)",
            security_questions,
        )

        login_history = [
            # Normal logins for C001
            ("LOG-001", "C001", "2025-09-15T08:30:00", "192.168.1.10", "desktop", "Austin", "US", 1),
            ("LOG-002", "C001", "2025-09-14T09:15:00", "192.168.1.10", "desktop", "Austin", "US", 1),
            ("LOG-003", "C001", "2025-09-13T07:45:00", "192.168.1.11", "mobile", "Austin", "US", 1),
            # Suspicious logins for C019 (compromised)
            ("LOG-004", "C019", "2025-09-01T03:22:00", "99.88.77.66", "desktop", "Lagos", "NG", 1),
            ("LOG-005", "C019", "2025-09-01T03:20:00", "99.88.77.66", "desktop", "Lagos", "NG", 0),
            ("LOG-006", "C019", "2025-09-01T03:18:00", "99.88.77.66", "desktop", "Lagos", "NG", 0),
            ("LOG-007", "C019", "2025-08-31T22:10:00", "192.168.6.60", "mobile", "Dallas", "US", 1),
            ("LOG-008", "C019", "2025-08-30T08:00:00", "192.168.6.60", "desktop", "Dallas", "US", 1),
            # Suspicious logins for C020 (compromised)
            ("LOG-009", "C020", "2025-08-28T04:15:00", "88.77.66.55", "desktop", "Minsk", "BY", 1),
            ("LOG-010", "C020", "2025-08-28T04:13:00", "88.77.66.55", "desktop", "Minsk", "BY", 0),
            ("LOG-011", "C020", "2025-08-27T19:30:00", "10.40.0.5", "mobile", "Los Angeles", "US", 1),
            # Normal logins for various customers
            ("LOG-012", "C007", "2025-08-20T08:00:00", "10.20.0.12", "desktop", "Boston", "US", 1),
            ("LOG-013", "C007", "2025-08-19T15:30:00", "10.20.0.12", "desktop", "Boston", "US", 0),
            ("LOG-014", "C004", "2025-09-10T12:00:00", "192.168.2.20", "mobile", "Chicago", "US", 1),
            ("LOG-015", "C016", "2025-09-15T10:00:00", "10.0.1.1", "desktop", "New York", "US", 1),
        ]

        await db.executemany(
            "INSERT INTO login_history (login_id, customer_id, login_time, ip_address, device_type, location_city, location_country, success) VALUES (?,?,?,?,?,?,?,?)",
            login_history,
        )

        # ============================================
        # WIRE TRANSFERS & COMPLIANCE
        # ============================================
        wire_transfers = [
            ("WIRE-001", "C016", "ACC024", "Swiss Bank AG", "CH93-0076-2011-6238-5295-7", "UBS", "UBSWCHZH80A", "CH", 50000.00, "USD", "Investment transfer", "REF-W001", "cleared", 1, 0.1, "completed", "2025-09-01"),
            ("WIRE-002", "C017", "ACC026", "London Trading Ltd", "GB29-NWBK-6016-1331-9268-19", "Barclays", "BARCGB22XXX", "GB", 75000.00, "USD", "Business payment", "REF-W002", "cleared", 1, 0.15, "completed", "2025-08-15"),
            ("WIRE-003", "C011", "ACC018", "Petrograd Trade LLC", "RU02-0445-2080-0000-0703-5220", "Sberbank", "SABRRUMM", "RU", 9900.00, "USD", "Consulting payment", "REF-W003", "held", 1, 0.85, "pending", "2025-09-13"),
            ("WIRE-004", "C013", "ACC021", "Mendez Import/Export SA", "MX05-1234-5678-9012-3456-78", "BBVA Mexico", "BCMRMXMM", "MX", 35000.00, "USD", "Trade settlement", "REF-W004", "pending", 0, 0.5, "pending", "2025-09-09"),
            ("WIRE-005", "C014", "ACC022", "Kyiv Holdings", "UA21-3223-1300-0002-6007-2339-5004-7", "PrivatBank", "PABORUA", "UA", 15000.00, "USD", "Family support", "REF-W005", "cleared", 1, 0.3, "processing", "2025-09-14"),
            ("WIRE-006", "C018", "ACC028", "Nakamura Industries", "JP92-0123-4567-8901-2345-6789", "MUFG Bank", "BOTKJPJT", "JP", 25000.00, "USD", "Business consulting", "REF-W006", "cleared", 1, 0.05, "completed", "2025-08-20"),
        ]

        await db.executemany(
            "INSERT INTO wire_transfers (wire_id, customer_id, source_account_id, beneficiary_name, beneficiary_account, beneficiary_bank, beneficiary_bank_swift, beneficiary_country, amount, currency, purpose, reference_number, compliance_status, ofac_screened, risk_score, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            wire_transfers,
        )

        compliance_checks = [
            ("CC-001", "WIRE-001", "ofac", "clear", "No matches found", "2025-09-01"),
            ("CC-002", "WIRE-001", "country_risk", "clear", "Switzerland - low risk", "2025-09-01"),
            ("CC-003", "WIRE-001", "amount_threshold", "review", "Amount exceeds $10,000 CTR filing required", "2025-09-01"),
            ("CC-004", "WIRE-002", "ofac", "clear", "No matches found", "2025-08-15"),
            ("CC-005", "WIRE-002", "amount_threshold", "review", "Amount exceeds $50,000 enhanced due diligence", "2025-08-15"),
            ("CC-006", "WIRE-003", "ofac", "hit", "Beneficiary matches OFAC SDN: Petrograd Trade LLC", "2025-09-13"),
            ("CC-007", "WIRE-003", "sanctions", "hit", "Russia - sanctioned jurisdiction", "2025-09-13"),
            ("CC-008", "WIRE-003", "country_risk", "hit", "Russia - high risk country", "2025-09-13"),
            ("CC-009", "WIRE-004", "ofac", "clear", "No exact match", "2025-09-09"),
            ("CC-010", "WIRE-004", "pep", "review", "Beneficiary name similar to PEP list entry", "2025-09-09"),
            ("CC-011", "WIRE-005", "ofac", "clear", "No matches found", "2025-09-14"),
            ("CC-012", "WIRE-005", "country_risk", "review", "Ukraine - elevated risk", "2025-09-14"),
            ("CC-013", "WIRE-006", "ofac", "clear", "No matches found", "2025-08-20"),
            ("CC-014", "WIRE-006", "country_risk", "clear", "Japan - low risk", "2025-08-20"),
        ]

        await db.executemany(
            "INSERT INTO compliance_checks (check_id, wire_id, check_type, result, details, checked_at) VALUES (?,?,?,?,?,?)",
            compliance_checks,
        )

        # ============================================
        # EMPLOYEES & EXPENSE DATA
        # ============================================
        employees = [
            ("EMP-001", "C001", "John", "Smith", "Engineering", None, 5000.00, 1000.00, "CORP-4521", "active"),
            ("EMP-002", "C002", "Maria", "Garcia", "Marketing", "EMP-001", 3000.00, 500.00, "CORP-7832", "active"),
            ("EMP-003", "C004", "Sarah", "Johnson", "Sales", "EMP-001", 8000.00, 2000.00, "CORP-3344", "active"),
            ("EMP-004", "C006", "Emily", "Davis", "Engineering", "EMP-001", 5000.00, 1000.00, "CORP-9900", "active"),
            ("EMP-005", "C007", "Michael", "Brown", "Finance", None, 4000.00, 800.00, "CORP-2211", "active"),
            ("EMP-006", "C008", "Lisa", "Martinez", "HR", "EMP-005", 3000.00, 500.00, "CORP-5533", "active"),
            ("EMP-007", "C009", "David", "Anderson", "Operations", "EMP-005", 6000.00, 1500.00, "CORP-8844", "active"),
            ("EMP-008", "C010", "Jennifer", "Taylor", "Sales", "EMP-003", 8000.00, 2000.00, "CORP-1122", "active"),
        ]

        await db.executemany(
            "INSERT INTO employees (employee_id, customer_id, first_name, last_name, department, manager_id, expense_limit_monthly, expense_limit_single, corporate_card_id, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            employees,
        )

        expense_reports = [
            ("EXP-RPT-001", "EMP-003", "Q3 Client Visits - West Coast", "2025-09-10", "2025-07-01", "2025-09-30", 4250.00, "submitted", None, "2025-09-10"),
            ("EXP-RPT-002", "EMP-001", "AWS re:Invent Conference", "2025-08-15", "2025-08-01", "2025-08-15", 3200.00, "manager_approved", None, "2025-08-15"),
            ("EXP-RPT-003", "EMP-002", "Social Media Campaign Shoot", "2025-09-01", "2025-08-15", "2025-08-30", 1850.00, "submitted", None, "2025-09-01"),
            ("EXP-RPT-004", "EMP-005", "Q3 Audit Travel", "2025-09-05", "2025-08-01", "2025-09-05", 2100.00, "finance_review", None, "2025-09-05"),
            ("EXP-RPT-005", "EMP-007", "Supply Chain Site Visits", "2025-09-12", "2025-09-01", "2025-09-12", 5800.00, "submitted", None, "2025-09-12"),
            ("EXP-RPT-006", "EMP-008", "Trade Show - Atlanta", "2025-08-20", "2025-08-18", "2025-08-20", 1450.00, "approved", None, "2025-08-20"),
            ("EXP-RPT-007", "EMP-004", "Team Offsite Dinner", "2025-09-14", "2025-09-14", "2025-09-14", 680.00, "submitted", None, "2025-09-14"),
            ("EXP-RPT-008", "EMP-006", "HR Conference - Portland", "2025-08-25", "2025-08-22", "2025-08-25", 1200.00, "rejected", "Missing receipts for hotel charges", "2025-08-25"),
            ("EXP-RPT-009", "EMP-003", "Emergency Client Meeting", "2025-09-15", "2025-09-15", "2025-09-15", 2200.00, "submitted", None, "2025-09-15"),
            ("EXP-RPT-010", "EMP-001", "Home Office Supplies", "2025-09-08", "2025-09-01", "2025-09-08", 450.00, "approved", None, "2025-09-08"),
            ("EXP-RPT-011", "EMP-007", "Client Entertainment - Duplicates", "2025-09-13", "2025-09-10", "2025-09-13", 890.00, "submitted", None, "2025-09-13"),
            ("EXP-RPT-012", "EMP-002", "Photo Shoot Props", "2025-09-14", "2025-09-14", "2025-09-14", 320.00, "submitted", None, "2025-09-14"),
        ]

        await db.executemany(
            "INSERT INTO expense_reports (report_id, employee_id, title, submission_date, period_start, period_end, total_amount, status, reviewer_notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            expense_reports,
        )

        expense_items = [
            # EXP-RPT-001: Client visits (some over-limit)
            ("EXI-001", "EXP-RPT-001", "EMP-003", "2025-07-15", "travel", "Flight SFO-LAX round trip", 380.00, "USD", "receipt_001.pdf", "Delta Airlines", 1, 1, None),
            ("EXI-002", "EXP-RPT-001", "EMP-003", "2025-07-15", "lodging", "Hotel 3 nights - LA", 900.00, "USD", "receipt_002.pdf", "Hilton", 1, 1, None),
            ("EXI-003", "EXP-RPT-001", "EMP-003", "2025-07-16", "meals", "Client dinner", 450.00, "USD", "receipt_003.pdf", "Nobu", 1, 1, None),
            ("EXI-004", "EXP-RPT-001", "EMP-003", "2025-08-20", "travel", "Flight SFO-SEA round trip", 320.00, "USD", "receipt_004.pdf", "Alaska Airlines", 1, 1, None),
            ("EXI-005", "EXP-RPT-001", "EMP-003", "2025-08-20", "client_entertainment", "Client golf outing", 1200.00, "USD", "receipt_005.pdf", "Pebble Beach", 1, 0, "Exceeds single expense limit of $2000"),
            ("EXI-006", "EXP-RPT-001", "EMP-003", "2025-09-05", "transport", "Uber rides (5)", 150.00, "USD", None, "Uber", 0, 1, None),
            ("EXI-007", "EXP-RPT-001", "EMP-003", "2025-09-06", "meals", "Team lunch", 350.00, "USD", "receipt_007.pdf", "Fancy Restaurant", 1, 1, None),
            ("EXI-008", "EXP-RPT-001", "EMP-003", "2025-09-07", "supplies", "Presentation materials", 500.00, "USD", "receipt_008.pdf", "Office Depot", 1, 1, None),
            # EXP-RPT-002: Conference
            ("EXI-009", "EXP-RPT-002", "EMP-001", "2025-08-01", "travel", "Flight to Las Vegas", 550.00, "USD", "receipt_009.pdf", "United Airlines", 1, 1, None),
            ("EXI-010", "EXP-RPT-002", "EMP-001", "2025-08-01", "lodging", "Hotel 5 nights", 1500.00, "USD", "receipt_010.pdf", "The Venetian", 1, 1, None),
            ("EXI-011", "EXP-RPT-002", "EMP-001", "2025-08-03", "meals", "Conference dinners", 350.00, "USD", "receipt_011.pdf", "Various", 1, 1, None),
            ("EXI-012", "EXP-RPT-002", "EMP-001", "2025-08-05", "transport", "Airport transfers", 120.00, "USD", "receipt_012.pdf", "Lyft", 1, 1, None),
            ("EXI-013", "EXP-RPT-002", "EMP-001", "2025-08-10", "supplies", "Conference swag/materials", 680.00, "USD", "receipt_013.pdf", "Various vendors", 1, 1, None),
            # EXP-RPT-003: Marketing shoot
            ("EXI-014", "EXP-RPT-003", "EMP-002", "2025-08-15", "supplies", "Photography props", 450.00, "USD", "receipt_014.pdf", "Prop House Inc", 1, 1, None),
            ("EXI-015", "EXP-RPT-003", "EMP-002", "2025-08-20", "meals", "Crew lunch", 180.00, "USD", "receipt_015.pdf", "Catering Co", 1, 1, None),
            ("EXI-016", "EXP-RPT-003", "EMP-002", "2025-08-25", "transport", "Equipment transport", 320.00, "USD", "receipt_016.pdf", "Moving Co", 1, 1, None),
            ("EXI-017", "EXP-RPT-003", "EMP-002", "2025-08-28", "supplies", "Backdrop materials", 900.00, "USD", "receipt_017.pdf", "Art Supply Co", 1, 0, "Exceeds single expense limit of $500"),
            # EXP-RPT-005: Over monthly limit
            ("EXI-018", "EXP-RPT-005", "EMP-007", "2025-09-01", "travel", "Flight to Detroit", 480.00, "USD", "receipt_018.pdf", "American Airlines", 1, 1, None),
            ("EXI-019", "EXP-RPT-005", "EMP-007", "2025-09-01", "lodging", "Hotel 4 nights", 1200.00, "USD", "receipt_019.pdf", "Marriott", 1, 1, None),
            ("EXI-020", "EXP-RPT-005", "EMP-007", "2025-09-03", "meals", "Factory tour team lunch", 280.00, "USD", "receipt_020.pdf", "Local Restaurant", 1, 1, None),
            ("EXI-021", "EXP-RPT-005", "EMP-007", "2025-09-05", "travel", "Flight to Memphis", 520.00, "USD", "receipt_021.pdf", "Delta Airlines", 1, 1, None),
            ("EXI-022", "EXP-RPT-005", "EMP-007", "2025-09-05", "lodging", "Hotel 3 nights", 960.00, "USD", "receipt_022.pdf", "Hilton", 1, 1, None),
            ("EXI-023", "EXP-RPT-005", "EMP-007", "2025-09-07", "transport", "Rental car", 450.00, "USD", "receipt_023.pdf", "Enterprise", 1, 1, None),
            ("EXI-024", "EXP-RPT-005", "EMP-007", "2025-09-10", "client_entertainment", "Client dinner", 1200.00, "USD", "receipt_024.pdf", "Steakhouse", 1, 0, "Exceeds single expense limit"),
            ("EXI-025", "EXP-RPT-005", "EMP-007", "2025-09-12", "meals", "Working lunch", 45.00, "USD", None, "Sandwich Shop", 0, 1, None),
            ("EXI-026", "EXP-RPT-005", "EMP-007", "2025-09-12", "supplies", "Printer cartridges", 665.00, "USD", "receipt_026.pdf", "Staples", 1, 1, None),
            # EXP-RPT-008: Rejected - missing receipts
            ("EXI-027", "EXP-RPT-008", "EMP-006", "2025-08-22", "travel", "Flight to Portland", 350.00, "USD", "receipt_027.pdf", "Alaska Airlines", 1, 1, None),
            ("EXI-028", "EXP-RPT-008", "EMP-006", "2025-08-22", "lodging", "Hotel 3 nights", 600.00, "USD", None, "Hotel Monaco", 0, 0, "Missing receipt - over $25 threshold"),
            ("EXI-029", "EXP-RPT-008", "EMP-006", "2025-08-24", "meals", "Conference meals", 150.00, "USD", "receipt_029.pdf", "Various", 1, 1, None),
            ("EXI-030", "EXP-RPT-008", "EMP-006", "2025-08-24", "transport", "Uber rides", 100.00, "USD", None, "Uber", 0, 0, "Missing receipt - over $25 threshold"),
            # EXP-RPT-011: Potential duplicates
            ("EXI-031", "EXP-RPT-011", "EMP-007", "2025-09-10", "client_entertainment", "Client dinner at steakhouse", 450.00, "USD", "receipt_031.pdf", "Steakhouse", 1, 1, None),
            ("EXI-032", "EXP-RPT-011", "EMP-007", "2025-09-10", "client_entertainment", "Client dinner at steakhouse", 440.00, "USD", "receipt_032.pdf", "Steakhouse", 1, 0, "Possible duplicate of EXI-031"),
            # EXP-RPT-007: Team dinner over limit
            ("EXI-033", "EXP-RPT-007", "EMP-004", "2025-09-14", "client_entertainment", "Team offsite dinner - 8 people", 680.00, "USD", "receipt_033.pdf", "Italian Restaurant", 1, 1, None),
            # EXP-RPT-009: High single expense
            ("EXI-034", "EXP-RPT-009", "EMP-003", "2025-09-15", "travel", "Last-minute flight SFO-NYC", 1800.00, "USD", "receipt_034.pdf", "United Airlines", 1, 1, None),
            ("EXI-035", "EXP-RPT-009", "EMP-003", "2025-09-15", "meals", "Working dinner with client", 400.00, "USD", "receipt_035.pdf", "Per Se", 1, 1, None),
            # Small report
            ("EXI-036", "EXP-RPT-010", "EMP-001", "2025-09-02", "supplies", "Monitor stand", 180.00, "USD", "receipt_036.pdf", "Amazon", 1, 1, None),
            ("EXI-037", "EXP-RPT-010", "EMP-001", "2025-09-05", "supplies", "Keyboard and mouse", 150.00, "USD", "receipt_037.pdf", "Amazon", 1, 1, None),
            ("EXI-038", "EXP-RPT-010", "EMP-001", "2025-09-08", "supplies", "Webcam", 120.00, "USD", "receipt_038.pdf", "Best Buy", 1, 1, None),
            # More items for EXP-RPT-006
            ("EXI-039", "EXP-RPT-006", "EMP-008", "2025-08-18", "travel", "Flight ATL round trip", 320.00, "USD", "receipt_039.pdf", "Southwest", 1, 1, None),
            ("EXI-040", "EXP-RPT-006", "EMP-008", "2025-08-18", "lodging", "Hotel 2 nights", 480.00, "USD", "receipt_040.pdf", "Westin", 1, 1, None),
            ("EXI-041", "EXP-RPT-006", "EMP-008", "2025-08-19", "meals", "Booth team dinner", 350.00, "USD", "receipt_041.pdf", "Steakhouse", 1, 1, None),
            ("EXI-042", "EXP-RPT-006", "EMP-008", "2025-08-20", "supplies", "Trade show materials", 300.00, "USD", "receipt_042.pdf", "FedEx Office", 1, 1, None),
            # Photo shoot props (EXP-RPT-012)
            ("EXI-043", "EXP-RPT-012", "EMP-002", "2025-09-14", "supplies", "Fabric samples", 120.00, "USD", "receipt_043.pdf", "Fabric Store", 1, 1, None),
            ("EXI-044", "EXP-RPT-012", "EMP-002", "2025-09-14", "supplies", "Color print samples", 80.00, "USD", "receipt_044.pdf", "Print Shop", 1, 1, None),
            ("EXI-045", "EXP-RPT-012", "EMP-002", "2025-09-14", "meals", "Team working lunch", 120.00, "USD", "receipt_045.pdf", "Deli", 1, 1, None),
        ]

        await db.executemany(
            "INSERT INTO expense_items (expense_id, report_id, employee_id, expense_date, category, description, amount, currency, receipt_url, merchant_name, has_receipt, policy_compliant, flag_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            expense_items,
        )

        expense_policy_data = [
            ("EPOL-001", "travel", 2000.00, 25.0, 500.0, None, "Flights must be economy class for domestic"),
            ("EPOL-002", "lodging", 300.0, 25.0, 500.0, None, "Max $300/night, pre-approval needed for higher"),
            ("EPOL-003", "meals", 75.0, 25.0, 500.0, None, "Per-person limit. Client meals up to $150/person."),
            ("EPOL-004", "transport", 200.0, 25.0, 500.0, None, "Rideshare/taxi. Rental cars need pre-approval."),
            ("EPOL-005", "supplies", 500.0, 25.0, 500.0, None, "Office supplies and materials"),
            ("EPOL-006", "client_entertainment", 500.0, 25.0, 200.0, None, "Pre-approval required. No alcohol-only expenses."),
            ("EPOL-007", "other", 250.0, 25.0, 100.0, None, "Requires detailed justification"),
        ]

        await db.executemany(
            "INSERT INTO expense_policy (policy_id, category, max_amount, requires_receipt_above, requires_manager_approval_above, allowed_merchants, notes) VALUES (?,?,?,?,?,?,?)",
            expense_policy_data,
        )

        # ============================================
        # CREDIT CARD DISPUTES
        # ============================================
        card_disputes = [
            ("DSP-001", "C002", "ACC004", "TXN005", "unauthorized", 89.99, "I did not make this purchase. My card was in my possession.", "Amazon", None, None, 0, None, "open", "2025-10-05", "2025-09-15", None),
            ("DSP-002", "C003", "ACC006", "TXN007", "billing_error", 150.00, "I was charged $150 but the order total was $75. Double charged.", "Uber Eats", "Investigating internal records", None, 1, None, "investigating", "2025-10-27", "2025-09-13", None),
            ("DSP-003", "C007", "ACC012", "TXN012", "merchandise_not_received", 75.00, "Food delivery never arrived but I was charged.", "Grubhub", None, None, 0, None, "open", "2025-10-26", "2025-09-12", None),
            ("DSP-004", "C010", "ACC017", "TXN014", "defective", 320.00, "Dress arrived with stains and torn seam. Store won't accept return.", "Anthropologie", "Customer was offered store credit but declined", '["photos_of_damage.zip"]', 1, None, "merchant_contacted", "2025-10-18", "2025-09-08", None),
            ("DSP-005", "C018", "ACC029", "TXN040", "unauthorized", 4200.00, "I did not book this hotel. Possible card cloning.", "Four Seasons", None, None, 0, None, "open", "2025-10-05", "2025-09-14", None),
            ("DSP-006", "C019", "ACC030", "TXN041", "unauthorized", 2500.00, "Account was compromised. I did not make this purchase.", "Unknown Merchant", None, None, 1, None, "investigating", "2025-10-16", "2025-09-05", None),
            ("DSP-007", "C020", "ACC032", "TXN043", "unauthorized", 1800.00, "Someone used my card to buy crypto. I never use crypto exchanges.", "Crypto Exchange", None, None, 0, None, "open", "2025-10-12", "2025-09-10", None),
            ("DSP-008", "C005", "ACC008", "TXN009", "duplicate", 85.00, "I was charged twice for the same Target purchase.", "Target", "System shows single charge only", '["pos_receipt.pdf"]', 0, "merchant_favor", "resolved", "2025-10-05", "2025-09-06", "2025-09-20"),
            ("DSP-009", "C001", "ACC001", "TXN003", "billing_error", 67.50, "Gas station charged me $67.50 but I only pumped $45 of gas.", "Shell Gas", None, None, 0, None, "open", "2025-10-23", "2025-09-12", None),
            ("DSP-010", "C004", "ACC007", "TXN008", "cancelled_subscription", 420.00, "Flight was cancelled by airline but refund never issued.", "Delta Airlines", "Airline confirms flight operated as scheduled", '["flight_manifest.pdf"]', 0, None, "merchant_contacted", "2025-10-01", "2025-08-15", None),
        ]

        await db.executemany(
            "INSERT INTO card_disputes (dispute_id, customer_id, account_id, transaction_id, dispute_type, disputed_amount, customer_statement, merchant_name, merchant_response, evidence_submitted, provisional_credit_issued, resolution, status, reg_e_deadline, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            card_disputes,
        )

        await db.commit()
