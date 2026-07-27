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