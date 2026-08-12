-- Enable pgcrypto extension for encrypted phone numbers at rest
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Camps Table
CREATE TABLE IF NOT EXISTS camps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  room_types JSONB NOT NULL DEFAULT '["Wise as Serpents", "Villa", "Hostel", "Dormitory"]'::jsonb,
  admin_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Camp Admins / Invites Table
CREATE TABLE IF NOT EXISTS camp_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'accepted', -- 'pending' | 'accepted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(camp_id, email)
);

-- 3. Attendees Table
CREATE TABLE IF NOT EXISTS attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  fellowship TEXT NOT NULL,
  room_type TEXT NOT NULL,
  room_number TEXT NOT NULL,
  key_bearer TEXT NOT NULL,
  encrypted_phone BYTEA,
  room_id UUID,  -- FK to rooms, assigned via the Admin Rooms page
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camp_id UUID NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  room_type TEXT NOT NULL,
  key_bearer_id UUID REFERENCES attendees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(camp_id, room_number)
);

-- Add room_id FK constraint after rooms table is created
ALTER TABLE attendees
  ADD CONSTRAINT fk_attendees_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;

-- Index for ultra-fast public search
CREATE INDEX IF NOT EXISTS idx_attendees_full_name ON attendees(full_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_attendees_camp_id ON attendees(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_camp_id ON rooms(camp_id);

-- Enable RLS
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rooms
CREATE POLICY "Public read rooms" ON rooms
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage rooms" ON rooms
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM camps
      WHERE camps.id = rooms.camp_id
      AND (camps.created_by = auth.uid() OR EXISTS (SELECT 1 FROM camp_admins WHERE camp_id = camps.id AND user_id = auth.uid()))
    )
  );


-- RLS Policies for camps
CREATE POLICY "Public read access for camps" ON camps
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create camps" ON camps
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can update their camps" ON camps
  FOR UPDATE USING (
    auth.uid() = created_by OR 
    EXISTS (SELECT 1 FROM camp_admins WHERE camp_id = camps.id AND user_id = auth.uid())
  );

-- RLS Policies for attendees
-- Public can ONLY read non-sensitive fields
CREATE POLICY "Public read non-sensitive attendee data" ON attendees
  FOR SELECT USING (true);

-- Authenticated admins can manage attendees
CREATE POLICY "Admins full access to attendees" ON attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM camps 
      WHERE camps.id = attendees.camp_id 
      AND (camps.created_by = auth.uid() OR EXISTS (SELECT 1 FROM camp_admins WHERE camp_id = camps.id AND user_id = auth.uid()))
    )
  );

-- Stored Procedures for pgcrypto Encryption & Decryption
CREATE OR REPLACE FUNCTION add_attendee_encrypted(
  p_camp_id UUID,
  p_full_name TEXT,
  p_fellowship TEXT,
  p_room_type TEXT,
  p_room_number TEXT,
  p_key_bearer TEXT,
  p_phone_number TEXT,
  p_secret_key TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_encrypted BYTEA;
BEGIN
  IF p_phone_number IS NOT NULL AND p_phone_number != '' THEN
    v_encrypted := pgp_sym_encrypt(p_phone_number, p_secret_key);
  ELSE
    v_encrypted := NULL;
  END IF;

  INSERT INTO attendees (camp_id, full_name, fellowship, room_type, room_number, key_bearer, encrypted_phone)
  VALUES (p_camp_id, p_full_name, p_fellowship, p_room_type, p_room_number, p_key_bearer, v_encrypted)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_attendees_decrypted(
  p_camp_id UUID,
  p_secret_key TEXT
) RETURNS TABLE (
  id UUID,
  camp_id UUID,
  full_name TEXT,
  fellowship TEXT,
  room_type TEXT,
  room_number TEXT,
  key_bearer TEXT,
  phone_number TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.camp_id,
    a.full_name,
    a.fellowship,
    a.room_type,
    a.room_number,
    a.key_bearer,
    CASE 
      WHEN a.encrypted_phone IS NOT NULL THEN pgp_sym_decrypt(a.encrypted_phone, p_secret_key)
      ELSE NULL
    END AS phone_number,
    a.created_at
  FROM attendees a
  WHERE a.camp_id = p_camp_id
  ORDER BY a.room_number ASC, a.full_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
