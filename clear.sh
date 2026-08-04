echo "--------------------------------"
echo "Clearing Database"
echo "--------------------------------"

wrangler d1 execute beyblade-combos --local --command "DELETE FROM combo_parts;"
wrangler d1 execute beyblade-combos --local --command "DELETE FROM combos;"
wrangler d1 execute beyblade-combos --local --command "DELETE FROM processed_posts;"
wrangler d1 execute beyblade-combos --local --command "DELETE FROM blades;"
wrangler d1 execute beyblade-combos --local --command "DELETE FROM parts;"