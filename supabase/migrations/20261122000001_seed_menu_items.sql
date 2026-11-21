-- =============================================================================
-- EVERYTIME CREAMERY — SEED MASTER MENU ITEMS & VARIANTS
-- Migration: 20261122000001_seed_menu_items.sql
-- =============================================================================

-- 22 ARTISAN GELATO FLAVORS (Single Scoop 85g @ Rs 99 = 9900 paise, direct add)
INSERT INTO public.menu_items (id, category_id, name, base_price_paise, interaction_type, is_available, is_premium) VALUES
('gelato-madagascar-vanilla', 'gelato', 'Madagascar Vanilla', 9900, 'direct', true, false),
('gelato-pistachio-siciliano', 'gelato', 'Pistachio Siciliano', 9900, 'direct', true, true),
('gelato-belgian-dark-chocolate', 'gelato', 'Belgian Dark Chocolate 70%', 9900, 'direct', true, false),
('gelato-hazelnut-praline', 'gelato', 'Hazelnut Praline (Nocciola)', 9900, 'direct', true, true),
('gelato-alphonso-mango', 'gelato', 'Alphonso Mango Sorbet', 9900, 'direct', true, false),
('gelato-roasted-almond-honey', 'gelato', 'Roasted Almond & Honey', 9900, 'direct', true, false),
('gelato-wild-berry-cheesecake', 'gelato', 'Wild Berry Cheesecake', 9900, 'direct', true, false),
('gelato-salted-caramel', 'gelato', 'Salted Caramel Butterscotch', 9900, 'direct', true, false),
('gelato-espresso-arabica', 'gelato', 'Espresso Arabica', 9900, 'direct', true, false),
('gelato-stracciatella', 'gelato', 'Stracciatella (Sweet Cream & Flakes)', 9900, 'direct', true, false),
('gelato-tiramisu-classico', 'gelato', 'Tiramisu Classico', 9900, 'direct', true, false),
('gelato-ferrero-crunch', 'gelato', 'Ferrero Crunch Gelato', 9900, 'direct', true, true),
('gelato-lotus-biscoff', 'gelato', 'Lotus Biscoff Crumble', 9900, 'direct', true, true),
('gelato-mint-dark-choc', 'gelato', 'Mint Dark Choc Chip', 9900, 'direct', true, false),
('gelato-strawberries-cream', 'gelato', 'Strawberries & Clotted Cream', 9900, 'direct', true, false),
('gelato-passionfruit-sorbetto', 'gelato', 'Passionfruit Sorbetto', 9900, 'direct', true, false),
('gelato-coconut-lime', 'gelato', 'Coconut Lime Zest', 9900, 'direct', true, false),
('gelato-nutella-swirl', 'gelato', 'Nutella Swirl Supreme', 9900, 'direct', true, true),
('gelato-blueberry-lavender', 'gelato', 'Blueberry Lavender Infusion', 9900, 'direct', true, false),
('gelato-matcha-green-tea', 'gelato', 'Matcha Ceremonial Green Tea', 9900, 'direct', true, false),
('gelato-white-choc-raspberry', 'gelato', 'White Chocolate Raspberry Ripple', 9900, 'direct', true, false),
('gelato-kulfi-royale', 'gelato', 'Kulfi Royale with Cardamom & Saffron', 9900, 'direct', true, true)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    base_price_paise = EXCLUDED.base_price_paise,
    interaction_type = EXCLUDED.interaction_type,
    is_available = EXCLUDED.is_available,
    is_premium = EXCLUDED.is_premium;

-- TAKEAWAY TUBS (Available in 250ml & 500ml)
INSERT INTO public.menu_items (id, category_id, name, base_price_paise, interaction_type, is_available, is_premium) VALUES
('tub-classic-vanilla', 'tubs', 'Classic Vanilla Tub', 16900, 'gelato_sizes', true, false),
('tub-hazel-nutella', 'tubs', 'Hazel Nutella Tub', 21900, 'gelato_sizes', true, true),
('tub-oreo-cream', 'tubs', 'Oreo N'' Cream Tub', 17900, 'gelato_sizes', true, false),
('tub-pistachio-bronte', 'tubs', 'Pistachio Bronte Tub', 23900, 'gelato_sizes', true, true),
('tub-belgian-chocolate', 'tubs', 'Belgian Chocolate Tub', 19900, 'gelato_sizes', true, false)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    base_price_paise = EXCLUDED.base_price_paise,
    interaction_type = EXCLUDED.interaction_type;

-- VARIANTS FOR TUBS
INSERT INTO public.menu_variants (id, menu_item_id, label, price_paise, volume_ml) VALUES
('tub-classic-vanilla-250', 'tub-classic-vanilla', '250ml', 16900, 250),
('tub-classic-vanilla-500', 'tub-classic-vanilla', '500ml', 32900, 500),
('tub-hazel-nutella-250', 'tub-hazel-nutella', '250ml', 21900, 250),
('tub-hazel-nutella-500', 'tub-hazel-nutella', '500ml', 42900, 500),
('tub-oreo-cream-250', 'tub-oreo-cream', '250ml', 17900, 250),
('tub-oreo-cream-500', 'tub-oreo-cream', '500ml', 34900, 500),
('tub-pistachio-bronte-250', 'tub-pistachio-bronte', '250ml', 23900, 250),
('tub-pistachio-bronte-500', 'tub-pistachio-bronte', '500ml', 45900, 500),
('tub-belgian-chocolate-250', 'tub-belgian-chocolate', '250ml', 19900, 250),
('tub-belgian-chocolate-500', 'tub-belgian-chocolate', '500ml', 37900, 500)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    price_paise = EXCLUDED.price_paise,
    volume_ml = EXCLUDED.volume_ml;

-- WAFFLES, SUNDAES, SHAKES, HOT CHOCOLATE, EXTRAS
INSERT INTO public.menu_items (id, category_id, name, base_price_paise, interaction_type, is_available, is_premium) VALUES
('waffle-nutella-bliss', 'waffle', 'Nutella Bliss Waffle', 18900, 'waffle_scoop', true, true),
('waffle-plain-butter', 'waffle', 'Belgian Waffle Plain', 12900, 'waffle_scoop', true, false),
('sundae-hot-choc-fudge', 'sundaes', 'Hot Chocolate Fudge', 14900, 'direct', true, false),
('sundae-kitkat', 'sundaes', 'Kitkat Crunch Sundae', 19900, 'direct', true, false),
('sundae-brownie-blast', 'sundaes', 'Brownie Gelato Blast', 21900, 'direct', true, true),
('hot-choc-classic', 'hot_chocolate', 'Classic Thick Hot Chocolate', 14900, 'direct', true, false),
('hot-choc-hazelnut', 'hot_chocolate', 'Hazelnut Hot Chocolate', 17900, 'direct', true, true),
('shake-belgian-choc', 'thickshakes', 'Belgian Chocolate Shake', 19900, 'direct', true, false),
('shake-alphonso-mango', 'thickshakes', 'Alphonso Mango Shake', 18900, 'direct', true, false),
('extra-wafer-cone', 'extra', 'Wafer Cone', 1500, 'direct', true, false),
('extra-waffle-cone', 'extra', 'Waffle Cone', 2500, 'direct', true, false),
('extra-hot-fudge', 'extra', 'Hot Fudge Sauce', 3500, 'direct', true, false),
('extra-cold-milo', 'extra', 'Cold Milo', 14900, 'direct', true, false)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    base_price_paise = EXCLUDED.base_price_paise,
    interaction_type = EXCLUDED.interaction_type;
