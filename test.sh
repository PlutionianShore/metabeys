#!/bin/bash

echo "--------------------------------"
echo "Clearing Database"
echo "--------------------------------"

wrangler d1 execute beyblade-combos --command "DELETE FROM combo_parts;"
wrangler d1 execute beyblade-combos --command "DELETE FROM combos;"
wrangler d1 execute beyblade-combos --command "DELETE FROM blades;"
wrangler d1 execute beyblade-combos --command "DELETE FROM parts;"
wrangler d1 execute beyblade-combos --command "DELETE FROM part_types;"

echo ""
echo "--------------------------------"
echo "Submitting Test HTML"
echo "--------------------------------"

curl -X POST http://localhost:8787/submit \
--data-binary "@test_data/test-post.html"

echo ""
echo ""
echo "--------------------------------"
echo "Combos"
echo "--------------------------------"

wrangler d1 execute beyblade-combos --command "SELECT * FROM combos;"

echo ""
echo "--------------------------------"
echo "Blades"
echo "--------------------------------"

wrangler d1 execute beyblade-combos --command "SELECT * FROM blades;"

echo ""
echo "--------------------------------"
echo "Parts"
echo "--------------------------------"

wrangler d1 execute beyblade-combos --command "SELECT * FROM parts;"

echo ""
echo "--------------------------------"
echo "Combo Parts"
echo "--------------------------------"

wrangler d1 execute beyblade-combos --command "SELECT * FROM combo_parts;"

echo ""
echo "--------------------------------"
echo "Blade Counts"
echo "--------------------------------"

wrangler d1 execute beyblade-combos \
--command "
SELECT
    name,
    COUNT(*) AS uses
FROM blades
JOIN combos ON combos.blade_id = blades.id
GROUP BY blades.id
ORDER BY uses DESC;
"

echo ""
echo "--------------------------------"
echo "Part Counts"
echo "--------------------------------"

wrangler d1 execute beyblade-combos \
--command "
SELECT
    parts.name,
    COUNT(*) AS uses
FROM combo_parts
JOIN parts ON combo_parts.part_id = parts.id
GROUP BY parts.id
ORDER BY uses DESC;
"

wrangler d1 execute beyblade-combos --local --command "
SELECT b.name AS blade, pt.name AS part_type, p.name AS part, 
COUNT(*) AS uses FROM combos c 
JOIN combo_parts cp ON cp.combo_id = c.id 
JOIN parts p ON p.id = cp.part_id 
JOIN part_types pt ON pt.id = p.part_type_id 
JOIN blades b ON b.id = c.blade_id 
WHERE c.posted_at >= date('now', '-7 days') 
GROUP BY b.name, pt.name, p.name 
ORDER BY b.name, uses DESC;"