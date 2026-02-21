import aiosqlite
from db.connection import DB_PATH

SCHEMA_SQL = """
-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
    customer_id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    ssn_last4 TEXT,
    date_of_birth TEXT,
    address_line1 TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    address_country TEXT DEFAULT 'US',
    id_document_type TEXT,
    id_document_number TEXT,
    id_document_expiry TEXT,
    id_verified INTEGER DEFAULT 0,
    risk_score REAL DEFAULT 0.0,
    kyc_status TEXT DEFAULT 'pending',
    account_status TEXT DEFAULT 'active',
    account_opened_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_type TEXT NOT NULL,
    account_number TEXT NOT NULL,
    routing_number TEXT,
    balance REAL DEFAULT 0.0,
    credit_limit REAL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'active',
    opened_date TEXT,
    last_activity_date TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id),
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    merchant_name TEXT,
    merchant_category TEXT,
    description TEXT,
    status TEXT DEFAULT 'completed',
    channel TEXT,
    ip_address TEXT,
    device_fingerprint TEXT,
    location_city TEXT,
    location_country TEXT,
    risk_flag TEXT DEFAULT 'none',
    created_at TEXT NOT NULL,
    settled_at TEXT
);

-- ============================================
-- REFUND TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    order_total REAL NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT DEFAULT 'delivered',
    shipping_carrier TEXT,
    tracking_number TEXT,
    delivery_date TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
    item_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(order_id),
    product_name TEXT NOT NULL,
    product_sku TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    category TEXT
);

CREATE TABLE IF NOT EXISTS refund_requests (
    refund_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(order_id),
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    policy_violation TEXT,
    agent_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS refund_policy (
    policy_id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    max_refund_days INTEGER NOT NULL,
    requires_return INTEGER DEFAULT 1,
    max_no_receipt_amount REAL DEFAULT 25.0,
    restocking_fee_pct REAL DEFAULT 0.0
);

-- ============================================
-- INSURANCE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS insurance_policies (
    policy_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    policy_type TEXT NOT NULL,
    policy_number TEXT NOT NULL,
    premium_monthly REAL,
    deductible REAL,
    coverage_limit REAL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS insurance_claims (
    claim_id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL REFERENCES insurance_policies(policy_id),
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    claim_type TEXT NOT NULL,
    incident_date TEXT NOT NULL,
    incident_description TEXT,
    claimed_amount REAL NOT NULL,
    approved_amount REAL,
    status TEXT DEFAULT 'submitted',
    adjuster_notes TEXT,
    supporting_docs TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- LOAN TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS loan_applications (
    application_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    loan_type TEXT NOT NULL,
    requested_amount REAL NOT NULL,
    term_months INTEGER NOT NULL,
    purpose TEXT,
    annual_income REAL,
    employment_status TEXT,
    employer_name TEXT,
    years_employed REAL,
    credit_score INTEGER,
    debt_to_income_ratio REAL,
    collateral_type TEXT,
    collateral_value REAL,
    status TEXT DEFAULT 'submitted',
    decision_reason TEXT,
    approved_amount REAL,
    approved_rate REAL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_reports (
    report_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    bureau TEXT NOT NULL,
    credit_score INTEGER NOT NULL,
    total_accounts INTEGER,
    open_accounts INTEGER,
    delinquent_accounts INTEGER,
    total_balance REAL,
    credit_utilization REAL,
    bankruptcies INTEGER DEFAULT 0,
    collections INTEGER DEFAULT 0,
    hard_inquiries_12m INTEGER DEFAULT 0,
    report_date TEXT NOT NULL
);

-- ============================================
-- KYC TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS kyc_verifications (
    verification_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    verification_type TEXT NOT NULL,
    document_type TEXT,
    document_number TEXT,
    verification_result TEXT DEFAULT 'pending',
    confidence_score REAL,
    flags TEXT,
    verified_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist_entries (
    entry_id TEXT PRIMARY KEY,
    list_type TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_aliases TEXT,
    entity_country TEXT,
    match_threshold REAL DEFAULT 0.85,
    active INTEGER DEFAULT 1
);

-- ============================================
-- TRANSACTION MONITORING TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS alerts (
    alert_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_id TEXT REFERENCES accounts(account_id),
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    trigger_rule TEXT,
    trigger_details TEXT,
    related_transactions TEXT,
    status TEXT DEFAULT 'open',
    analyst_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monitoring_rules (
    rule_id TEXT PRIMARY KEY,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    parameters TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    active INTEGER DEFAULT 1
);

-- ============================================
-- CHARGEBACK TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS chargebacks (
    chargeback_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_id TEXT NOT NULL REFERENCES accounts(account_id),
    reason_code TEXT NOT NULL,
    reason_description TEXT,
    disputed_amount REAL NOT NULL,
    merchant_name TEXT,
    merchant_response TEXT,
    evidence_docs TEXT,
    status TEXT DEFAULT 'open',
    deadline_date TEXT,
    outcome TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- ACCOUNT RECOVERY TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS account_recovery_requests (
    request_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_id TEXT NOT NULL REFERENCES accounts(account_id),
    recovery_type TEXT NOT NULL,
    verification_method TEXT,
    verification_status TEXT DEFAULT 'pending',
    otp_code TEXT,
    otp_expires_at TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    ip_address TEXT,
    device_info TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS security_questions (
    question_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    question TEXT NOT NULL,
    answer_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_history (
    login_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    login_time TEXT NOT NULL,
    ip_address TEXT,
    device_type TEXT,
    location_city TEXT,
    location_country TEXT,
    success INTEGER DEFAULT 1
);

-- ============================================
-- WIRE TRANSFER TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS wire_transfers (
    wire_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    source_account_id TEXT NOT NULL REFERENCES accounts(account_id),
    beneficiary_name TEXT NOT NULL,
    beneficiary_account TEXT NOT NULL,
    beneficiary_bank TEXT NOT NULL,
    beneficiary_bank_swift TEXT,
    beneficiary_country TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    purpose TEXT,
    reference_number TEXT,
    compliance_status TEXT DEFAULT 'pending',
    ofac_screened INTEGER DEFAULT 0,
    risk_score REAL DEFAULT 0.0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compliance_checks (
    check_id TEXT PRIMARY KEY,
    wire_id TEXT REFERENCES wire_transfers(wire_id),
    check_type TEXT NOT NULL,
    result TEXT NOT NULL,
    details TEXT,
    checked_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- EXPENSE REIMBURSEMENT TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS employees (
    employee_id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES customers(customer_id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    department TEXT,
    manager_id TEXT,
    expense_limit_monthly REAL DEFAULT 5000.0,
    expense_limit_single REAL DEFAULT 1000.0,
    corporate_card_id TEXT,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS expense_reports (
    report_id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id),
    title TEXT NOT NULL,
    submission_date TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    total_amount REAL DEFAULT 0.0,
    status TEXT DEFAULT 'submitted',
    reviewer_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expense_items (
    expense_id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES expense_reports(report_id),
    employee_id TEXT NOT NULL REFERENCES employees(employee_id),
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    receipt_url TEXT,
    merchant_name TEXT,
    has_receipt INTEGER DEFAULT 0,
    policy_compliant INTEGER DEFAULT 1,
    flag_reason TEXT
);

CREATE TABLE IF NOT EXISTS expense_policy (
    policy_id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    max_amount REAL,
    requires_receipt_above REAL DEFAULT 25.0,
    requires_manager_approval_above REAL DEFAULT 500.0,
    allowed_merchants TEXT,
    notes TEXT
);

-- ============================================
-- CREDIT CARD DISPUTE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS card_disputes (
    dispute_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_id TEXT NOT NULL REFERENCES accounts(account_id),
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
    dispute_type TEXT NOT NULL,
    disputed_amount REAL NOT NULL,
    customer_statement TEXT,
    merchant_name TEXT,
    merchant_response TEXT,
    evidence_submitted TEXT,
    provisional_credit_issued INTEGER DEFAULT 0,
    resolution TEXT,
    status TEXT DEFAULT 'open',
    reg_e_deadline TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
);
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
