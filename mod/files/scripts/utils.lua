dofile("mods/streamer_wands/files/scripts/json.lua")
dofile_once("data/scripts/perks/perk.lua")
dofile_once("data/scripts/gun/gun_actions.lua")
dofile_once("mods/streamer_wands/files/scripts/enemyNames.lua")
dofile_once("mods/streamer_wands/files/scripts/enemyNamesApoth.lua")
dofile_once("mods/streamer_wands/stats.lua")

function get_player()
    local player = EntityGetWithTag("player_unit") or nil
    if player ~= nil then
        return player[1]
    end
end

function get_world_state()
    local world = EntityGetWithTag("world_state") or nil
    if world ~= nil then
        return EntityGetFirstComponentIncludingDisabled(world[1], "WorldStateComponent")
    end
end

function get_player_pos()
    local x, y = EntityGetTransform(get_player())
    if (x ~= nil) then
        return { x, y }
    end
    return { 0, 0 }
end

function str_to_table(data)
    local ret = {}
    for value in string.gmatch(data, "([^,]+)") do
        table.insert(ret, value)
    end
    return ret
end

function get_wands()
    local childs = EntityGetAllChildren(get_player())
    local inven = nil
    if childs ~= nil then
        for _, child in ipairs(childs) do
            if EntityGetName(child) == "inventory_quick" then
                inven = child
            end
        end
    end
    local wands = {}
    if inven ~= nil then
        local items = EntityGetAllChildren(inven)
        for _, child_item in ipairs(items) do
            if EntityHasTag(child_item, "wand") then
                wands[_] = child_item
            end
        end
    end

    return wands or nil
end

function get_perks()
    local childs = EntityGetAllChildren(get_player())
    local perks = {}
    local order = {}
    for _, child in ipairs(childs) do
        local ui_comp = EntityGetFirstComponentIncludingDisabled(child, "UIIconComponent")
        local perk_comp = (ui_comp ~= nil and string.sub(ComponentGetValue2(ui_comp, "name"), 1, 5) == "$perk")
        local perk_tag = EntityHasTag(child, "perk_entity")
        local essence_tag = EntityHasTag(child, "essence_effect") and not EntityHasTag(child, "essence")
        local pseudo_tag = EntityHasTag(child, "pseudo_perk")
        local greed_tag = EntityHasTag(child, "greed_curse")
        if perk_tag or essence_tag or pseudo_tag or greed_tag or perk_comp then
            ui_comp = EntityGetFirstComponentIncludingDisabled(child, "UIIconComponent")
            game_effect_comp = EntityGetFirstComponentIncludingDisabled(child, "GameEffectComponent")
            local frames = 0
            if game_effect_comp ~= nil then
                frames = ComponentGetValue2(game_effect_comp, "frames")
            end
            if ui_comp ~= nil and frames == 0 then
                local name = ComponentGetValue2(ui_comp, "name")
                if name == "$status_apotheosis_creature_shifted_name" then
                    sprite = ComponentGetValue2(ui_comp, "icon_sprite_file")
                    last_slash = sprite:match '^.*()/'
                    name = name .. "_" .. string.sub(sprite, last_slash + 1, -5)
                end
                if perks[name] == nil then
                    perks[name] = 1
                    table.insert(order, name)
                else
                    perks[name] = perks[name] + 1
                end
            end
        end
    end
    return { perks = perks, order = order } or nil
end

function get_player_info()
    local player = get_player()
    local hp_comp = EntityGetFirstComponentIncludingDisabled(player, "DamageModelComponent")
    local money_comp = EntityGetFirstComponentIncludingDisabled(player, "WalletComponent")
    local money = ComponentGetValue2(money_comp, "money")
    local orbs = GameGetOrbCountThisRun()
    local max_hp = tostring(ComponentGetValue2(hp_comp, "max_hp"))
    local hp = tostring(ComponentGetValue2(hp_comp, "hp"))
    return { hp, max_hp, money, orbs }
end

function get_shift_timer()
    local last_trip = tonumber(GlobalsGetValue("fungal_shift_last_frame", "0"))
    local current_frame = GameGetFrameNum()
    local shift_timer = (current_frame - last_trip) / 60
    if (shift_timer >= 300) or (current_frame < 300 * 60 and last_trip == 0) then
        shift_timer = -1
    end
    return shift_timer
end

function get_shifts()
    local shiftList = {}
    local shiftNumber = tonumber(GlobalsGetValue("fungal_shift_iteration", "0"))

    for i = 1, shiftNumber do
        shiftMaterials = GlobalsGetValue("shift#" .. i, "empty")
        if i > 1 then
            local shiftsPrev = GlobalsGetValue("shift#" .. (i - 1), "empty")
            shiftMaterials = string.sub(shiftMaterials, string.len(shiftsPrev) + 4)
        end
        table.insert(shiftList, shiftMaterials)
    end
    return shiftList
end

function get_creature_shift_timer()
    local last_trip = tonumber(GlobalsGetValue("apotheosis_creature_shift_last_frame", "0"))
    local current_frame = GameGetFrameNum()
    local shift_timer = (current_frame - last_trip) / 60
    if (shift_timer >= 300) or (current_frame < 300 * 60 and last_trip == 0) then
        shift_timer = -1
    end
    return shift_timer
end

function get_creature_shifts(n)
    local shiftList = {}
    for i = 1, n do
        local creatures = {}
        local pre = "apotheosis_global_Cshift_"
        for j = 2, 1, -1 do
            local creature = GlobalsGetValue(pre .. i .. "_targ" .. j, "")
            local creature_name = GameTextGetTranslatedOrNot("$animal_" .. creature)
            if creature_name == "" then
                creature_name = GameTextGetTranslatedOrNot("$enemy_apotheosis_" .. creature)
                if creature_name == "" then
                    creature_name = creature
                end
            end
            table.insert(creatures, creature .. "%@%" .. creature_name)
        end
        table.insert(shiftList, table.concat(creatures, "<,>"))
    end
    return shiftList
end

function get_inventory()
    local childs = EntityGetAllChildren(get_player())
    local inven = nil
    if childs ~= nil then
        for _, child in ipairs(childs) do
            if EntityGetName(child) == "inventory_full" then
                inven = child
            end
        end
    end
    return inven or nil
end

function get_items()
    local childs = EntityGetAllChildren(get_player())
    local inven = nil
    if childs ~= nil then
        for _, child in ipairs(childs) do
            if EntityGetName(child) == "inventory_quick" then
                inven = child
            end
        end
    end
    return inven or nil
end

function get_wand_stats(id)
    local serialized = {}

    local ability_comp = EntityGetFirstComponentIncludingDisabled(id, "AbilityComponent")
    local item_comp = EntityGetFirstComponentIncludingDisabled(id, "ItemComponent")
    local sprite = ComponentGetValue2(item_comp, "ui_sprite")
    if string.len(sprite) > 0 then
        serialized.sprite = sprite
    else
        serialized.sprite = ComponentGetValue2(ability_comp, "sprite_file")
    end
    local use_name = ComponentGetValue2(item_comp, "always_use_item_name_in_ui")
    if use_name then
        item_name = ComponentGetValue2(item_comp, "item_name") or ComponentGetValue2(ability_comp, "ui_name")
        serialized.ui_name = GameTextGetTranslatedOrNot(item_name)
    else
        serialized.ui_name = "wand"
    end
    serialized.mana_max = ComponentGetValue2(ability_comp, "mana_max")
    serialized.mana_charge_speed = ComponentGetValue2(ability_comp, "mana_charge_speed")

    serialized.reload_time = ComponentObjectGetValue2(ability_comp, "gun_config", "reload_time")
    serialized.actions_per_round = ComponentObjectGetValue2(ability_comp, "gun_config", "actions_per_round")
    serialized.deck_capacity = ComponentObjectGetValue2(ability_comp, "gun_config", "deck_capacity")
    serialized.shuffle_deck_when_empty = ComponentObjectGetValue2(ability_comp, "gun_config", "shuffle_deck_when_empty")

    serialized.spread_degrees = ComponentObjectGetValue2(ability_comp, "gunaction_config", "spread_degrees")
    serialized.speed_multiplier = ComponentObjectGetValue2(ability_comp, "gunaction_config", "speed_multiplier")
    serialized.fire_rate_wait = ComponentObjectGetValue2(ability_comp, "gunaction_config", "fire_rate_wait")
    return serialized
end

function get_wand_spells(id)
    local childs = EntityGetAllChildren(id)
    local always_cast = {}
    local deck = {}
    if childs ~= nil then
        local last_slot = 0
        for _, child in ipairs(childs) do
            local item_comp = EntityGetFirstComponentIncludingDisabled(child, "ItemComponent")
            local item_action_component = EntityGetFirstComponentIncludingDisabled(child, "ItemActionComponent")
            if (item_comp ~= nil) and (item_action_component ~= nil) then
                local is_always_cast = ComponentGetValue2(item_comp, "permanently_attached")
                local action_id = ComponentGetValue2(item_action_component, "action_id")
                local slot = ComponentGetValue2(item_comp, "inventory_slot")
                local charges = ComponentGetValue2(item_comp, "uses_remaining")
                local empty_slots = slot - last_slot

                if empty_slots > 0 then
                    for s = 1, empty_slots do
                        table.insert(deck, "0")
                        last_slot = last_slot + 1
                    end
                end
                if (is_always_cast) then
                    table.insert(always_cast, action_id .. "_#" .. charges)
                else
                    table.insert(deck, action_id .. "_#" .. charges)
                    last_slot = last_slot + 1
                end
            end
        end
    end
    return always_cast, deck
end

function get_inventory_spells()
    local inven = get_inventory()
    if inven == nil then
        return
    end

    local inventory = {}
    local inven_slots = EntityGetAllChildren(inven)
    if inven_slots == nil then
        return
    end

    local last_slot = 0
    for _, child in ipairs(inven_slots) do
        local item_comp = EntityGetFirstComponentIncludingDisabled(child, "ItemComponent")
        local item_action_component = EntityGetFirstComponentIncludingDisabled(child, "ItemActionComponent")
        local action_id = ComponentGetValue2(item_action_component, "action_id")
        local charges = ComponentGetValue2(item_comp, "uses_remaining")
        local slot = ComponentGetValue2(item_comp, "inventory_slot")
        local empty_slots = slot - last_slot
        if empty_slots > 0 then
            for s = 1, empty_slots do
                table.insert(inventory, "0")
                last_slot = last_slot + 1
            end
        end
        if action_id == nil then
            action_id = "sampo"
            charges = -1
        end

        table.insert(inventory, action_id .. "_#" .. charges)
        last_slot = last_slot + 1
    end

    return inventory
end

function get_inventory_items()
    local items_inven = get_items()
    if items_inven == nil then
        return
    end

    local inventory = {}
    local item_inven_slots = EntityGetAllChildren(items_inven)

    if item_inven_slots == nil then
        return
    end

    local nonwand = {}
    for i, child in ipairs(item_inven_slots) do
        if not EntityHasTag(child, "wand") then
            table.insert(nonwand, child)
        end
    end

    local last_slot = 0
    local beer = "data/items_gfx/beer_bottle.png"
    for _, child in ipairs(nonwand) do
        local item_comp = EntityGetFirstComponentIncludingDisabled(child, "ItemComponent")
        local name = ComponentGetValue2(item_comp, "item_name")
        local desc = ComponentGetValue2(item_comp, "ui_description")
        local amt = "$-1"
        local spr = ComponentGetValue2(item_comp, "ui_sprite")
        if EntityHasTag(child, "potion") or EntityHasTag(child, "powder_stash") or (spr == beer) then
            local material_inv_comp = EntityGetFirstComponentIncludingDisabled(child, "MaterialInventoryComponent")
            local mats = ComponentGetValue2(material_inv_comp, "count_per_material_type")
            local color = GameGetPotionColorUint(child)
            amt = "$" .. color
            for k, mat in ipairs(mats) do
                local i = k - 1
                if mat > 0 then
                    local mat_id = CellFactory_GetName(i)
                    local mat_key = CellFactory_GetUIName(i)
                    local mat_name = GameTextGetTranslatedOrNot(mat_key)
                    amt = amt .. string.format("@%s (%s)#%s", mat_name, mat_id, mat)
                end
            end
        end
        local slot = ComponentGetValue2(item_comp, "inventory_slot")
        local empty_slots = slot - last_slot
        if empty_slots > 0 then
            for s = 1, empty_slots do
                table.insert(inventory, "0")
                last_slot = last_slot + 1
            end
        end
        table.insert(inventory, spr .. name .. desc .. amt)
        last_slot = last_slot + 1
    end
    return inventory
end

function get_run_info(ngpCheck, seedCheck)
    local versions = {}
    local modList = ModGetActiveModIDs()
    versions["mods"] = modList
    versions["beta"] = GameIsBetaBuild()
    if ngpCheck then
        versions["ngp"] = tonumber(SessionNumbersGetValue("NEW_GAME_PLUS_COUNT"))
    end
    if seedCheck then
        versions["seed"] = tonumber(StatsGetValue("world_seed"))
    end
    versions["start"] = GlobalsGetValue("start_time", "")
    versions["playtime"] = tonumber(StatsGetValue("playtime"))
    return versions
end

function apotheosis_check()
    return ModIsEnabled("apotheosis") or ModIsEnabled("Apotheosis")
end

function get_spells_progress()
    local spells = {}
    local lock = ModIsEnabled("conga_spell_lock")
    for _, spell in ipairs(actions) do
        if HasFlagPersistent("action_" .. string.lower(spell.id)) then
            if lock and not HasFlagPersistent("disabled_" .. string.lower(spell.id)) then
                table.insert(spells, spell.id)
            elseif not lock then
                table.insert(spells, spell.id)
            end
        end
    end
    return spells
end

function get_perks_progress()
    local perks = {}
    for _, perk in ipairs(perk_list) do
        if HasFlagPersistent("perk_picked_" .. string.lower(perk.id)) then
            table.insert(perks, perk.id)
        end
    end
    return perks
end

function get_enemies_progress()
    local enemies = {}
    local currentEnemies = enemyNames
    if apotheosis_check() then
        currentEnemies = enemyNamesApoth
    end
    for _, enemy in ipairs(currentEnemies) do
        local flag = "kill_" .. string.lower(enemy)
        if GameHasFlagRun("new_" .. flag) or (stats[enemy]) then
            AddFlagPersistent(flag)
        elseif stats[enemy] ~= nil and stats[enemy] ~= 0 then
            AddFlagPersistent(flag)
        end
        if HasFlagPersistent(flag) then
            table.insert(enemies, enemy)
        end
    end
    return enemies
end

function check_flags(flags)
    local checked_flags = {}
    for _, pillar in ipairs(flags) do
        for __, flag in ipairs(pillar) do
            if HasFlagPersistent(flag[1]) then
                table.insert(checked_flags, flag[1])
            end
            if HasFlagPersistent(table.concat({ "apotheosis_card_unlocked_", flag[1] })) then
                table.insert(checked_flags, flag[1])
            end
        end
    end
    return checked_flags
end

function get_pillars_progress()
    local flags =
    {
        { { "misc_chest_rain", "crain" }, { "misc_util_rain", "urain" },        { "misc_worm_rain", "wrain" },       { "misc_greed_rain", "grain" },      { "misc_altar_tablet", "train" },        { "misc_mimic_potion_rain", "mrain" },       { "misc_monk_bots", "mbots" },           { "misc_sun_effect", "seffect" }, { "misc_darksun_effect", "dseffect" }, { "secret_tower", "secrett" },       { "player_status_ghostly", "pghost" }, { "player_status_ratty", "prat" },         { "player_status_funky", "pfungi" },    { "player_status_lukky", "plukki" }, { "player_status_halo", "phalo" } },
        { { "essence_fire", "essencef" }, { "essence_water", "essencew" },      { "essence_laser", "essencee" },     { "essence_air", "essencea" },       { "essence_alcohol", "essenceal" },      { "secret_moon", "moon" },                   { "secret_moon2", "moona" },             { "special_mood", "moong" },      { "secret_dmoon", "dmoon" },           { "dead_mood", "dmoong" },           { "secret_sun_collision", "sunmoon" }, { "secret_darksun_collision", "dsunmoon" } },
        { { "progress_ending0", "end0" }, { "progress_ending1_toxic", "endt" }, { "progress_ending1_gold", "endb" }, { "progress_ending2", "endg" },      { "progress_newgameplusplus3", "endp" }, { "progress_nightmare", "endn" } },
        { { "miniboss_dragon", "minid" }, { "miniboss_limbs", "minil" },        { "miniboss_meat", "meat" },         { "miniboss_ghost", "minigh" },      { "miniboss_pit", "minip" },             { "miniboss_alchemist", "minia" },           { "miniboss_robot", "minir" },           { "miniboss_wizard", "meme" },    { "miniboss_maggot", "maggot" },       { "miniboss_fish", "fish" },         { "miniboss_islandspirit", "elk" },    { "miniboss_threelk", "threelk" },         { "miniboss_gate_monsters", "minigm" }, { "final_secret_orb3", "yeah3" },    { "miniboss_sky", "minisky" },    { "boss_centipede", "boss" } },
        { { "progress_orb_1", "orbf" },   { "progress_orb_evil", "orbe" },      { "progress_orb_all", "orba" },      { "progress_pacifist", "pacifist" }, { "progress_nogold", "nogold" },         { "progress_clock", "clock" },               { "progress_minit", "minit" },           { "progress_nohit", "nohit" },    { "progress_sun", "sun" },             { "progress_darksun", "dsun" },      { "progress_sunkill", "sunkill" },     { "secret_supernova", "col" } },
        { { "secret_greed", "secretg" },  { "final_secret_orb", "yeah" },       { "final_secret_orb2", "yeah2" },    { "secret_chest_dark", "secretcd" }, { "secret_chest_light", "secretcl" },    { "card_unlocked_everything", "secretall" }, { "card_unlocked_divide", "secretten" }, { "secret_fruit", "secretf" },    { "secret_allessences", "secretae" },  { "secret_meditation", "secretme" }, { "secret_buried_eye", "secretbe" },   { "secret_hourglass", "secrethg" },        { "progress_hut_a", "huta" },           { "progress_hut_b", "hutb" },        { "secret_null", "null" } },
    }
    pillars = check_flags(flags)
    if apotheosis_check() then
        local flags_apoth =
        {
            { { "pandora_chest_rain", "p_secret_pandora" },        { "clam_chest_rain", "p_secret_clam" },                  { "musical_magic_played", "p_secret_musical_magic" },          { "unlocked_divine_liquid", "p_secret_opposing_porring" }, { "boss_flesh_monster_gourd_holy", "p_boss_heretic_gourd_holy" } },
            { { "perkforged_protection_fire", "p_perk_fire" },     { "perkforged_breath_underwater", "p_perk_breathless" }, { "perkforged_protection_electricity", "p_perk_electricity" }, { "perkforged_telekinesis", "p_perk_telekinesis" },        { "perkforged_edit_wands_everywhere", "p_perk_twwe" },           { "perkforged_remove_fog_of_war", "p_perk_ase" },                { "perkforged_apotheosis_alcohol_immunity", "p_perk_drunk" },    { "perkforged_apotheosis_trip_immunity", "p_perk_trip" }, { "perkforged_mega_beam_stone", "p_perk_beamstone" }, { "perkforged_global_gore", "p_perk_moreblood" }, { "perkforged_apotheosis_plane_radar", "p_perk_radar" }, { "essence_fungus", "p_essence_fungus" }, { "moon_fungus_unlock", "p_essence_fungus_moon" }, },
            { { "ending_apotheosis_01", "p_ending_01" },           { "ending_apotheosis_02", "p_ending_02" },               { "ending_apotheosis_03", "p_ending_03" },                     { "ending_apotheosis_speedrun", "p_ending_500" },          { "ending_apotheosis_speedrun_1hr", "p_ending_100_hr" },         { "ending_apotheosis_hardcore", "p_ending_challenge_hardcore" }, { "ending_apotheosis_everything", "p_ending_challenge_tuonela" } },
            { { "boss_toxic_worm", "p_boss_toxic" },               { "blob_boss", "p_boss_blob" },                          { "musical_boss", "p_boss_music" },                            { "boss_monolith", "p_boss_monolith" },                    { "fire_lukki", "p_boss_fire_lukki" },                           { "worm_end_big", "p_boss_hell_worm" },                          { "boss_flesh_monster", "p_boss_heretic" },                      { "boss_flesh_monster_wrath", "p_boss_heretic_wrath" }, },
            { { "foundneworb", "p_orb_1" },                        { "foundallneworbs", "p_orb_4" },                        { "45_orbs", "p_orb_45" }, },
            { { "divine_red_fish_unlocked", "p_secret_red_fish" }, { "cat_secret", "p_secret_cat" },                        { "donated_beggar", "p_secret_hobo" },                         { "sleep", "p_secret_sleep" },                             { "lost_alchemy", "p_secret_alchemy_ants" },                     { "perk_creation", "p_secret_perk_creation" },                   { "omega_cross", "p_secret_omegadeath" },                        { "rage_aura", "p_secret_trolling" }, },
        }
        pillars_apoth = check_flags(flags_apoth)
        for _, flag in ipairs(pillars_apoth) do
            table.insert(pillars, flag)
        end
    end
    return pillars
end

function serialize_data()
    local player = get_player()
    if (player == nil) then
        return ""
    end
    local data = {}

    local serialized = {}
    local wands_ids = get_wands()
    for _, wand in ipairs(wands_ids) do
        local stats = get_wand_stats(wand)
        local always_cast, deck = get_wand_spells(wand)
        table.insert(serialized, { stats, always_cast, deck })
    end
    data["wands"] = serialized
    data["inventory"] = get_inventory_spells()
    data["items"] = get_inventory_items()

    local perks = get_perks_progress()
    local spells = get_spells_progress()
    local enemies = get_enemies_progress()
    local pillars = get_pillars_progress()
    data["progress"] = { perks, spells, enemies, pillars }

    local ngpCheck = ModSettingGet("streamer_wands.ngp")
    local seedCheck = ModSettingGet("streamer_wands.seed")
    local runInfo = get_run_info(ngpCheck, seedCheck)
    data["runInfo"] = runInfo

    local apothTimerCheck = ModSettingGet("streamer_wands.apothCreatureTimer")
    local apothShiftsCheck = ModSettingGet("streamer_wands.apothCreatureShifts")
    if apotheosis_check() then
        local apothInfo = {}
        local creatureShiftNumber = tonumber(GlobalsGetValue("apotheosis_creature_shift_iteration", "0"))
        apothInfo["csTotal"] = creatureShiftNumber
        if apothTimerCheck then
            apothInfo["csTimer"] = get_creature_shift_timer()
        end
        if apothShiftsCheck then
            apothInfo["csShifts"] = get_creature_shifts(creatureShiftNumber)
        end
        data["apothInfo"] = apothInfo
    end

    local info = {}
    local shiftNumber = tonumber(GlobalsGetValue("fungal_shift_iteration", "0"))
    info["shiftsTotal"] = shiftNumber
    local shiftsCheck = ModSettingGet("streamer_wands.shifts")
    local timerCheck = ModSettingGet("streamer_wands.shiftsTimer")
    if shiftsCheck then
        local shiftList = get_shifts()
        info["shiftsList"] = shiftList
    end
    if timerCheck then
        local shift_timer = get_shift_timer()
        info["shiftsTimer"] = shift_timer
    end

    local perk_order = get_perks()
    local names = {}
    local amounts = {}
    for i = #perk_order.order, 1, -1 do
        table.insert(names, perk_order.order[i])
        table.insert(amounts, perk_order.perks[perk_order.order[i]])
    end
    info["perks"] = { names, amounts }

    local player_info = get_player_info()
    info["health"] = { player_info[1], player_info[2] }
    info["gold"] = player_info[3]
    info["orbs"] = player_info[4]
    local posCheck = ModSettingGet("streamer_wands.position")
    if posCheck then
        info["pos"] = get_player_pos()
    end
    data["playerInfo"] = info

    local features = {
        seed = seedCheck,
        pos = posCheck,
        ngp = ngpCheck,
        shifts = shiftsCheck,
        timer = timerCheck,
        apothCreatureTimer = apothTimerCheck,
        apothCreatureShifts = apothShiftsCheck,
    }

    data["modFeatures"] = features
    data["modVersion"] = dofile("mods/streamer_wands/version.lua")
    return json.encode(data)
end
