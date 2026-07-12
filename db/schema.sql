-- Which line: CX, BX, UX, Expanded ignored
CREATE TABLE blade_lines (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE  
);

-- A specific blade
CREATE TABLE blades (
  id INTEGER PRIMARY KEY,
  name TEXT,
  blade_line_id INTEGER REFERENCES blade_lines(id)
);

-- Categories of part: Lock Chip, Main Blade, Over Blade, Assist Blade, Ratchet, Bit, etc.
CREATE TABLE part_types (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE
);

-- Parts: like 3-60, Kick, M-85
CREATE TABLE parts (
  id INTEGER PRIMARY KEY,
  name TEXT,
  part_type_id INTEGER REFERENCES part_types(id)
);

-- One row per forum post
CREATE TABLE combos (
  id INTEGER PRIMARY KEY,
  blade_id INTEGER REFERENCES blades(id),
  posted_at TEXT,   -- ISO date
  raw_text TEXT
);

-- Junction table: which parts were used in which combo
CREATE TABLE combo_parts (
  combo_id INTEGER REFERENCES combos(id),
  part_id INTEGER REFERENCES parts(id),
  PRIMARY KEY (combo_id, part_id)
);