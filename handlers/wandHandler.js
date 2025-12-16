function strFilter(spell) {
    return typeof spell == 'string'
}

function statsValidation(stats) {
    for (const key in stats) {
        if (key == 'sprite') {
            if (typeof stats[key] != 'string') {
                stats[key] = '999'
            } else {
                let match = stats[key].match(/([^\/]+)\./)[1]
                if (match) stats[key] = match
            }
        } else if (key == 'ui_name') {
            if (typeof stats[key] != 'string') stats[key] = '999'
        } else if (key == 'shuffle_deck_when_empty') {
            if (typeof stats[key] != 'boolean') stats[key] = false
        } else {
            if (typeof stats[key] != 'number') stats[key] = 0
        }
    }
    return stats
}

function numbersValidation(arr) {
    for (const key in arr) {
        if (typeof arr[key] != 'number') arr[key] = 0
    }
    return arr
}

function numberValidation(value) {
    if (typeof value != 'number') value = 0
    return value
}

function typeValidation(varType, value) {
    if (typeof value != varType) value = null
    return value
}

exports.validate = (data) => {
    const modVersion = data?.modVersion || "pre-versioning"
    const wands = data?.wands || []
    const inventory = data?.inventory || Array(16).fill('0')
    const items = data?.items || Array(4).fill('0')
    const progress = data?.progress || []
    const modFeatures = {
        seed: false,
        pos: false,
        ngp: false,
        shifts: false,
        timer: false,
        apothCreatureTimer: false,
        apothCreatureShifts: false,
        ...data?.modFeatures
    }
    const runInfo = {
        mods: [],
        beta: "",
        ngp: 0,
        seed: 0,
        start: "",
        playtime: 0,
        ...data?.runInfo
    }
    const playerInfo = {
        perks: [[], []],
        shifts: [],
        shiftsTotal: 0,
        shiftsTimer: 0,
        health: [],
        gold: 0,
        orbs: 0,
        x: 0,
        y: 0,
        ...data?.playerInfo
    }
    const apothInfo = {
        csShifts: [],
        csTotal: 0,
        csTimer: 0,
        ...data?.apothinfo
    }

    const validatedModVersion = modVersion

    const validatedModFeatures = {}
    for (const [feature, value] of Object.entries(modFeatures)) {
        validatedModFeatures[feature] = typeValidation("boolean", value)
    }
    const validatedWands = []

    for (const wand of wands) {
        const valid = {}
        valid.stats = statsValidation(wand[0])
        valid.always_cast = wand[1].filter(strFilter)
        valid.deck = wand[2].filter(strFilter)
        validatedWands.push(valid)
    }
    const validatedSpells = inventory.filter(strFilter)
    const validatedItems = items.filter(strFilter)

    const progressKeys = ["perks", "spells", "enemies", "pillars"]
    const validatedProgress = {}
    progress.forEach((table, i) => {
        validatedProgress[progressKeys[i]] = table.filter(strFilter)
    })

    let validatedRunInfo = {}
    validatedRunInfo.mods = runInfo.mods.filter(strFilter)
    validatedRunInfo.beta = typeValidation("boolean", runInfo.beta)
    const date = runInfo.start.split(",").map((num, i) => Number(num))
    validatedRunInfo.start = new Date(Date.UTC(...date))
    validatedRunInfo.ngp = numberValidation(runInfo.ngp)
    validatedRunInfo.seed = numberValidation(runInfo.seed)
    validatedRunInfo.playtime = numberValidation(runInfo.playtime)
    const rant = (new Date() - validatedRunInfo.start) / 1000 - validatedRunInfo.playtime
    validatedRunInfo.idletime = Math.ceil(rant / 3) * 3
    const validatedApothInfo = {}
    validatedApothInfo.shifts = []
    if (apothInfo.csShifts) {
        for (const shiftRaw of apothInfo.csShifts) {
            if (shiftRaw != null && shiftRaw != "empty") {
                const shiftMaterials = shiftRaw.split("<,>")
                validatedApothInfo.shifts.push(shiftMaterials.filter(strFilter))
            }
        }
    }
    validatedApothInfo.shiftsTotal = numberValidation(apothInfo.csTotal)
    validatedApothInfo.shiftsTimer = numberValidation(apothInfo.csTimer)

    const validatedPlayerInfo = {}
    validatedPlayerInfo.names = playerInfo.perks[0].filter(strFilter)
    validatedPlayerInfo.amounts = numbersValidation(playerInfo.perks[1])
    validatedPlayerInfo.shifts = []
    if (playerInfo.shiftsList) {
        for (const shiftRaw of playerInfo.shiftsList) {
            if (shiftRaw != null && shiftRaw != "empty") {
                const shiftMaterials = shiftRaw.split("<,>")
                validatedPlayerInfo.shifts.push(shiftMaterials.filter(strFilter))
            }
        }
    }
    validatedPlayerInfo.shiftsTotal = numberValidation(playerInfo.shiftsTotal)
    validatedPlayerInfo.shiftsTimer = numberValidation(playerInfo.shiftsTimer)
    const pos = playerInfo.pos ?? null
    const health = playerInfo.health.filter(strFilter)
    validatedPlayerInfo.health = health.length > 0 ? health : health.map((x) => x.toString())
    validatedPlayerInfo.gold = numberValidation(playerInfo.gold)
    validatedPlayerInfo.orbs = numberValidation(playerInfo.orbs)
    validatedPlayerInfo.x = pos ? numberValidation(pos[0]) : null
    validatedPlayerInfo.y = pos ? numberValidation(pos[1]) : null

    return {
        modVersion: validatedModVersion,
        modFeatures: validatedModFeatures,
        wands: validatedWands,
        inventory: validatedSpells,
        items: validatedItems,
        progress: validatedProgress,
        runInfo: validatedRunInfo,
        apothInfo: validatedApothInfo,
        playerInfo: validatedPlayerInfo
    }
}
