-- TABELAS MULTI-TENANT
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  whatsapp_phone_id VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE client_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  db_host VARCHAR(200) NOT NULL,
  db_name VARCHAR(100) NOT NULL,
  db_user VARCHAR(100) NOT NULL,
  db_password_encrypted TEXT NOT NULL
);
