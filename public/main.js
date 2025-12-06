const HOP = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const xyToIndex = (x, y, w) => x * 4 + (y * 4 * w)
const indexToXY = (i, w) => [Math.floor(i % (w * 4) / 4), Math.floor(i / (w * 4))]
const secondsToTimeArray = (sec) => {
    const out = []
    const time = {
        days: sec / 3600 / 24 % 24,
        hr: sec / 3600 % 60,
        min: sec / 60 % 60,
        sec: sec % 60,
    }
    Object.entries(time).forEach(([label, num]) => {
        if (num > 1) {
            out.push(Math.floor(num) + label)
        }
    })
    return out
}


const WandContainer = Vue.component('wand-comp', {
    props: ['stats', 'ac', 'deck'],
    template: /*html*/`
    <div class="wand">
        <wand-stats :stats="stats" :deck="deck"></wand-stats>
        <template v-if="ac.length > 0">
            <wand-ac :spells="ac"></wand-ac>
        </template>
        <wand-deck :spells="deck" :capacity="stats.deck_capacity"></wand-deck>
    </div>`,
})

const WandStats = Vue.component('wand-stats', {
    data() {
        return {
            tooltip: null,
            spriteKey: this.stats.sprite,
            propOrder: [
                {
                    classes: 'crisp shuffle-deck',
                    label: 'Shuffle',
                    key: 'shuffle_deck_when_empty',
                    newSim: 'x'
                },
                {
                    classes: 'crisp spells-cast',
                    label: 'Spells/Cast',
                    key: 'actions_per_round',
                    newSim: 'a',
                },
                {
                    classes: 'crisp cast-delay',
                    label: 'Cast Delay',
                    key: 'fire_rate_wait',
                    simName: 'cast_delay',
                    newSim: 'd',
                },
                {
                    classes: 'crisp recharge-time',
                    label: 'Recharge Time',
                    key: 'reload_time',
                    newSim: 'r',
                },
                {
                    classes: 'crisp mana-max',
                    label: 'Mana Max',
                    key: 'mana_max',
                    newSim: 'm',
                },
                {
                    classes: 'crisp mana-charge',
                    label: 'Mana chg spd',
                    key: 'mana_charge_speed',
                    newSim: 'c',
                },
                {
                    classes: 'crisp deck-capacity',
                    label: 'Capacity',
                    key: 'deck_capacity',
                    newSim: 'l',
                },
                {
                    classes: 'crisp wand-spread',
                    label: 'Spread',
                    key: 'spread_degrees',
                    simName: 'spread',
                    newSim: 'q',
                },
                {
                    classes: 'crisp speed-mult',
                    label: 'Speed',
                    key: 'speed_multiplier',
                    newSim: 'v',
                },
            ],
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip, {
                placement: 'bottom',
                // modifiers: [{ name: 'offset', options: { offset: [0, 5] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    props: ['stats', 'deck'],
    methods: {
        updateTip() {
            if (this.tooltip) {
                this.tooltip.update()
            }
        },
    },
    computed: {
        sprite() {
            return wandSprites[this.spriteKey] || wandSprites['bomb_wand']
        },
        // item_chainsaw is a spritesheet so we need to detect that and give the div a class
        isAnimated() {
            return this.spriteKey == 'chainsaw'
        },
        uiStats() {
            const stats = Object.assign({}, this.stats)
            for (const key in stats) {
                if (key == 'shuffle_deck_when_empty') {
                    stats[key] = stats[key] ? 'Yes' : 'No'
                } else if (['fire_rate_wait', 'reload_time'].indexOf(key) > -1) {
                    stats[key] = (stats[key] / 60).toFixed(2)
                } else if (key == 'spread_degrees') {
                    stats[key] = `${stats[key].toFixed(1)} DEG`
                } else if (key == 'deck_capacity') {
                    const ac = this.$parent.ac.length
                    stats[key] = ac ? stats[key] - ac : stats[key]
                } else if (key == 'speed_multiplier') {
                    stats[key] = `x ${stats[key].toFixed(2)}`
                } else {
                    stats[key] = stats[key].toFixed && stats[key].toFixed(0)
                }
            }
            return stats
        },
        // old wand sim site, URL breaks if spell not present on page
        wandSimOld() {
            let link = 'https://noita-wand-simulator.salinecitrine.com/?'
            let statsLink = this.propOrder.map((prop) => {
                let name = prop.simName || prop.key
                let value = +this.stats[prop.key]
                return `${name}=${value}`
            }).join('&')
            let deckLink = this.deck.map((spell) => {
                const spellToCheck = spell.split("_#")[0]
                return HOP(spellDataMain, spellToCheck) ? spellToCheck : ""
            }).join('%2C')
            return link + statsLink + '&spells=' + deckLink
        },
        // new wand sim site, URL does not break if spell not on page
        wandSim() {
            let link = 'https://tinker-with-wands-online.vercel.app/?'
            let statsLink = this.propOrder.map(
                (prop) => `${prop.newSim}=${+this.stats[prop.key]}`).join('&')
            let deckLink = this.deck.map((spell) => {
                const spellToCheck = spell.split("_#")[0]
                return HOP(spellDataMain, spellToCheck) ? spellToCheck : ""
            }).join('%2C')
            return link + statsLink + '&spells=' + deckLink
        },
    },
    template: /*html*/`
    <div class="stats-wrapper">
        <div class="stats-header">
            <p class="stats-title">{{ stats.ui_name }}</p>
            <div ref="slot" class="shifts-tip wands-tip" @mouseenter="updateTip">
                <a :href="wandSim" tabindex="-1" target="_blank" rel="noopener noreferrer">
                    <p>Tinker</p>
                </a>
                <div ref="tooltip" class="tooltip fit">
                    <a :href="wandSimOld"  tabindex="-1" target="_blank" rel="noopener noreferrer">Old Tinker Link</a>
                    <ul>
                        <li>Both wand simulation sites do NOT include Epilogue 2 Spells</li>
                        <li>If the wand includes Epilogue 2 Spells they are replaced with a blank slot</li>
                        <li>"Projectile" simulator on Old Tinker is currently more informative</li>
                        <li>Both sites have a top right configuration button:
                            <ul>
                                <li>This is saved per-user, these Tinker links have no impact on the configuration</li>
                                <li>If you are comparing your simulation to in-game or someone else's simulation, make sure these settings are all valid/matching</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="stats">
            <div class="stats-props">
                <p v-for="prop in propOrder" :class="prop.classes" :key="prop.label">{{prop.label}}</p>
            </div>
            <div class="stats-props">
                <p v-for="prop in propOrder" :key="prop.key">{{uiStats[prop.key]}}</p>
            </div>
            <div :class="isAnimated ? 'anim-wand-slot' : 'wand-slot'">
                <img :src="'data:image/png;base64,' + sprite"/>
            </div>
        </div>
    </div>`,
})

const WandAc = Vue.component('wand-ac', {
    props: ['spells'],
    template: /*html*/`
    <div class="mt-20">
        <p>Always Cast:</p>
        <div class="spells">
            <spell-slot v-for="(spell,index) in spells" :spell="spell" :key="index"></spell-slot>
        </div>
    </div>`,
})

const WandDeck = Vue.component('wand-deck', {
    props: ['spells', 'capacity'],
    computed: {
        real_cap() {
            const ac = this.$parent.ac.length
            if (ac) {
                return this.capacity - ac
            } else {
                return this.capacity
            }
        },
        deck() {
            const d = new Array(this.real_cap)
            d.fill(1)
            return d
        },
    },
    template: /*html*/`
    <div class="mt-20">
        <p>Spells:</p>
        <div class="spells">
            <spell-slot v-for="(v, index) in deck" :spell="spells[index]" :key="index"></spell-slot>
        </div>
    </div>`,
})

const SpellSlot = Vue.component('spell-slot', {
    data() {
        return {
            tooltip: null,
            // override general class/element styling for uses remaining and spell background border
            pStyle: {
                fontSize: '18px',
                position: 'relative',
                left: '1px',
                top: '-2px',
                textShadow: '-2px 0 black, 0 2px black, 2px 0 black, 0 -2px black',
            },
            bgStyle: {
                width: '35px',
                height: '35px',
                top: '0px',
                left: '0px',
            },
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip.$el, {
                placement: 'bottom',
                modifiers: [{ name: 'offset', options: { offset: [0, 35] } }],
            })
        }
    },
    updated() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip.$el, {
                placement: 'bottom',
                modifiers: [{ name: 'offset', options: { offset: [0, 35] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        info() {
            if (this.spell == "0" || this.spell === undefined) return false
            const spell = this.spell
            let [id, uses] = spell.split('_#')
            const ac = this.$parent.$options.name == 'wand-ac'

            let data = spellDataMain
            let img = icons.spells.filter((x) => HOP(spellDataMain, x.id))
            if (this.switches.betaContent.state) {
                data = spellData
                img = icons.spells
            }
            if (this.switches.apothContent.state) {
                data = spellDataApoth
                img = apothIcons.spells
            }
            let keyedImages = img.reduce((obj, item) => Object.assign(obj, { [item.id]: item }), {})
            const missing = {
                name: id,
                description: "Either this spell is missing from onlywands or it is modded and onlywands doesn't support this mod yet",
                sprite: icons.pseuds.find((x) => x.id == "missingSpell").image,
            }
            return {
                id: id,
                uses: +uses,
                ac: ac,
                img: (HOP(keyedImages, id) ? keyedImages[id] : icons.pseuds.find((x) => x.id == "missingSpell")),
                data: (HOP(data, id) ? data[id] : missing),
            }
        },
    },
    props: ['spell'],
    inject: ['switches'],
    template: /*html*/`
    <div class="spell-slot">
        <template v-if="info">
            <img v-if="info.img.bgImage" :style="bgStyle" :src="'data:image/png;base64,' + info.img.bgImage"/>
            <img ref="slot" class="spellZoom" :src="'data:image/png;base64,' + info.data.sprite"/>
            <p v-if="(info.uses > -1) && !info.ac" :style="pStyle">
                {{ info.uses }}
            </p>
            <spell-tooltip ref="tooltip" :spell="info"></spell-tooltip>
        </template>
    </div>`,
})

// inventory items need a new component, basically a spell slot
const ItemSlot = Vue.component('item-slot', {
    data() {
        return {
            tooltip: null,
            url: null,
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip.$el, {
                placement: 'bottom',
                modifiers: [{ name: 'offset', options: { offset: [0, 35] } }],
            })
        }
    },
    updated() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip.$el, {
                placement: 'bottom',
                modifiers: [{ name: 'offset', options: { offset: [0, 35] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        spellVersion() {
            let out = spellDataMain
            if (this.switches.betaContent.state) {
                out = spellData
            }
            if (this.switches.apothContent.state) {
                out = spellDataApoth
            }
            return out
        },
        itemInfo() {
            // streamer-wands noita mod transfers item data via a concatenated string
            let [path, id, desc, mats] = this.item.split('$')
            if (!HOP(itemData, id)) return false
            if (!this.switches.apothContent.state && this.item.indexOf('potheosis') > -1)
                return false
            path = path.replace(new RegExp('mods/apotheosis/files', 'ig'), 'data')
            let materials = {}
            let m = []
            let color = ''
            if (mats.indexOf('@') > -1) {
                let both = mats.split('@')
                let c = +both[0]
                // streamer-wands noita mod outputs as an ABGR 8 byte number
                // so & with relavent FF byte and shift the bits
                color = {
                    r: c & 0xFF,
                    g: c >> 8 & 0xFF,
                    b: c >> 16 & 0xFF,
                    a: c >> 24 & 0xFF,
                }
                // color = [c & 0xFF, c >> 8 & 0xFF, c >> 16 & 0xFF, c >> 24 & 0xFF]
                let table = both.splice(1)
                table.forEach((x) => {
                    let [mat, amt] = x.split('#')
                    // streamer-wands noita mod only outputs amount of each material as a
                    // raw pixel amount, not a percent full so convert per container type
                    if (id == 'item_powder_stash_3') {
                        materials[mat] = +amt / 15
                    } else if (path == 'data/ui_gfx/items/potion_alchemist.png') {
                        materials[mat] = +amt / 5
                    } else if (path == 'data/ui_gfx/items/potion_reinforced.png') {
                        materials[mat] = +amt / 20
                    } else {
                        materials[mat] = +amt / 10
                    }
                })
                // sort by largest first
                m = Object.entries(materials)
                    .sort(([, a], [, b]) => b - a)
                    .map((x) => ({ name: x[0], amt: x[1] }))
            }

            return {
                id: id,
                name: itemData[id].name,
                // split the description lines
                desc: itemData[id].description[desc].replace(/\\n/g, '<br>'),
                sprite: itemData[id].sprite[path],
                mats: m,
                color: color,
                path: path,
                // set text to green if item is a tablet/book/etc that the game makes green
                book: id.indexOf('book') > -1,
            }
        },

        imgFilter() {
            b64 = 'data:image/png;base64,' + this.itemInfo.sprite
            let img = document.createElement('img')
            let canvas = document.createElement('canvas')
            // upscale from 16x16 to 32x32 image cause thats what the game does when drawing liquid fill lines
            canvas.width = 32
            canvas.height = 32
            let ctx = canvas.getContext('2d')
            // make the colors more accurate via brightness, potion/pouch sprites in data/ui_gfx/items
            // are not quite the same as what they appear in game, and I can't find any data
            // on the filtering/algorithm to replicate how the game does it
            let filters = "brightness(116%)"
            img.src = b64
            img.onload = () => {
                ctx.imageSmoothingEnabled = false
                if (this.itemInfo.path == 'data/ui_gfx/items/material_pouch.png') {
                    filters = "brightness(135%)"
                }
                ctx.filter = filters
                ctx.drawImage(img, 0, 0, 32, 32)
                let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                let data = imageData.data
                const mat = this.itemInfo.color
                // get fullness of material container as a decimal from 0-1
                const perc = 1 - this.itemInfo.mats.reduce((n, { amt }) => n + amt, 0) / 100
                // all noita materials never fill the top 3 pixels so define an offset
                // data is an array of RGBA elements that starts at x=0,y=0
                for (let i = 0; i < data.length; i += 4) {
                    const [x, y] = indexToXY(i, 32)
                    let r = data[i]
                    let g = data[i + 1]
                    let b = data[i + 2]

                    let elevenTall = [
                        'data/ui_gfx/items/material_pouch.png',
                        'data/ui_gfx/items/potion_alchemist.png',
                        'data/ui_gfx/items/potion_reinforced.png',
                    ]
                    // do not recolor pixels if we are either at top of material container
                    // or the material container isn't full enough for coloration at this x/y
                    if ((y < 6 || y < Math.floor(22 * perc + 6)) && elevenTall.some((n) => n == this.itemInfo.path)) {
                        continue
                    } else if ((y < 6 || y < Math.floor(24 * perc + 6)) && this.itemInfo.path == 'data/ui_gfx/items/potion.png') {
                        continue
                    } else {
                        // mulitplicative color mixing
                        data[i] = (mat.r * r) >> 8
                        data[i + 1] = (mat.g * g) >> 8
                        data[i + 2] = (mat.b * b) >> 8
                    }
                }
                ctx.putImageData(imageData, 0, 0)
                this.url = canvas.toDataURL()
            }
            return this.url
        },
    },
    props: ['item'],
    inject: ['switches'],
    template: /*html*/`
    <div class="item-slot">
        <template v-if="itemInfo">
            <img v-if="itemInfo.color" ref="slot" :src="imgFilter"/>
            <img v-else ref="slot" :src="'data:image/png;base64,' + itemInfo.sprite"/>
            <item-tooltip ref="tooltip" :item="itemInfo" :img="imgFilter"></item-tooltip>
        </template>
    </div>`,
})

// spell-tooltip but for items
const ItemTooltip = Vue.component('item-tooltip', {
    computed: {
        // add materials in descending order to material container names
        // also add the fullness percentage
        info() {
            let names = ''
            let total = ''
            if (this.item.mats.length > 0) {
                names = this.item.mats
                    .reduce((n, { name }) => `${n}+${name.split(" (")[0]}`, '')
                    .substring(1)
                total = `(${Math.floor(this.item.mats.reduce((n, { amt }) => n + amt, 0))}% full)`
            }
            return {
                name: `${names} ${this.item.name} ${total ? total : ''}`,
            }
        },
    },
    props: ['item', 'img'],
    template: /*html*/`
    <div class="tooltip" :class="{ book: item.book }">
        <p class="tooltip-title">{{ info.name }}</p>
        <p class="tooltip-wiki">({{ item.id }})</p>
        <template v-if="item.mats"
            <p v-for="(mat,i) in item.mats" :key="i" class="tooltip-description">{{ Math.ceil(mat.amt) }}% {{ mat.name }}</p>
        </template>
        <div class="desc-container">
            <p class="tooltip-description" v-html="item.desc"></p>
            <img v-if="item.color" ref="slot" :src="img"/>
            <img v-else ref="slot" :src="'data:image/png;base64,' + item.sprite"/>
        </div>
    </div>`,
})

const worldComp = Vue.component('world-comp', {
    data() {
        return {
            state: {
                shifts: false,
                apothCS: false,
                mods: false,
                map: false,
                userDisabled: false,
            },
            // debugMods: "",
            // debugNG: "0",
            // debug: "",
            // debug: "hide-input",
        }
    },
    computed: {
        info() {
            const player = this.player
            const output = this.run
            const apoth = this.apoth
            output.shifts = player.shifts
            output.count = player.shiftsTotal
            output.timer = player.shiftsTimer
            output.apoth = {
                csShifts: apoth.shifts,
                csCount: apoth.shiftsTotal,
                csTimer: apoth.shiftsTimer,
            }
            return output
        },
        featureOutput() {
            const features = this.features
            delete features._id
            return {
                "Seed": features.seed,
                "Position": features.pos,
                "New Game Plus": features.ngp,
                "Fungal Shifts": features.shifts,
                "Fungal Timer": features.timer,
                "Creature Shifts": features.apothCreatureShifts,
                "Creature Timer": features.apothCreatureTimer,
            }
        },
        apothCheck() {
            const switches = this.switches
            return switches.apothContent.state
        },
    },
    props: ['apoth', 'player', 'run', 'features'],
    inject: ['switches'],
    template: /*html*/`
    <div class="world-info">
        <div class="world-header">
            <v-switch v-model="state.shifts" :title="'Show ' + (apothCheck ? 'Fungal ' : '') + 'Shifts [' + info.count + ']'"></v-switch>
            <v-switch v-if="apothCheck" v-model="state.apothCS" :title="'Show Creature Shifts [' + info.apoth.csCount + ']'"></v-switch>
            <v-switch v-model="state.mods" :title="'Show Mods [' + info.mods.length + ']'"></v-switch>
            <v-switch v-model="state.userDisabled" title="Show Feature Status"></v-switch>
            <v-switch v-model="state.map" title="Show Map and Game info (spoilers!!!)"></v-switch>
        </div>
        <div class="world-body">
            <fungal-comp v-if="state.shifts" :shifts="info.shifts" :timer="info.timer" :number="info.count" :features="features"></fungal-comp>
            <creatureShift-comp v-if="state.apothCS" :shifts="info.apoth.csShifts" :timer="info.apoth.csTimer" :number="info.apoth.csCount" :features="features"></creatureShift-comp>
            <div v-if="state.mods" class="mods">
                <!--<input v-model="debugMods" :class="debug"/>-->
                <p><u>Mods:</u></p>
                <!--<input v-model="debugNG" :class="debug"/>-->
                <p v-for="mod in info.mods" :key="mod">{{ mod.length < 20 ? mod : mod.slice(0,20) }}</p>
            </div>
            <div v-if="state.userDisabled" class="features">
                <div class="features-table">
                <div class="features-row header">
                    <div><b>Feature: </b></div>
                    <div><b>Status</b></div>
                </div>
                <div class="features-row" v-for="(value, feature) in featureOutput"">
                    <div>{{ feature }}</div>
                    <div>{{ value ? "Enabled" : "Disabled" }}</div>
                </div>
            </div>
            </div>
            <map-comp v-if="state.map" :player="player" :info="info" :features="features"></map-comp>
        </div>
    </div>`
})

const mapComp = Vue.component('map-comp', {
    data() {
        return {
            mapData: {},
            loaded: false,
            // input: "0,0",
            tipSeed: `Seed was incremented by ${this.info.ngp}.\n(to display correct NG+ noitool shifts)`,
        }
    },
    mounted() {
        fetch("https://noitamap.com/js/tilesources.json")
            .then(res => (res.ok ? res.json() : Promise.reject(`HTTP ${res.status}: ${res.statusText}`)))
            .then(data => {
                this.mapData = data
                this.loaded = true
            })
            .catch(err => console.log(`map data fetch failed with error: ${err}`))
    },
    computed: {
        seedInfo() {
            // if (!this.seed) return null
            let seedNumber = this.info.seed + this.info.ngp
            let url = `https://noitool.com/info?seed=${seedNumber}`
            // uncomment when noita starts receiving beta pushes again
            // if (this.switches.betaContent.state) {
            //     url = `https://dev.noitool.com/info?${seed}`
            // }
            if (this.switches.apothContent.state) {
                url = false
            }
            return { seed: `Seed: ${seedNumber}`, url: url }
        },
        osd() {
            // map image zoom size
            const zoom = 8
            // chunk coordinate offsets/distances
            const yHell = 34
            const yHeaven = -14
            const yLoop = 48
            let widthPW = 70
            let tileWidth = 70
            // from game coord input
            const x = this.player.x || 0
            const y = this.player.y || 0
            // debug coord input
            // const [x, y] = this.input.split(",").map((x) => +x) || [0, 0]

            const mapLabels = {
                "regular-main-branch": "Regular",
                "new-game-plus-main-branch": "NG+",
                "nightmare-main-branch": "Nightmare",
                "regular-beta": "Regular",
                "purgatory": "Purgatory",
                "apotheosis": "Apotheosis",
                "apotheosis-beta-branch": "Apotheosis",
                "apotheosis-new-game-plus": "Apotheosis NG+",
                "apotheosis-tuonela": "Apotheosis Tuonela",
                "noitavania": "Noitavania",
                "noitavania-new-game-plus": "Noitavania NG+",
                "alternate-biomes": "Alternate Biomes"
            }
            const apothNames = ["$curse_apotheosis_everything_name", "$curse_apotheosis_downunder_name"]

            // determine gamemode/map type
            let mapName = this.info.ngp > 0 ? "new-game-plus-main-branch" : "regular-main-branch"
            const mapModes = this.info.mods.map((x) => x.toLowerCase())
            if (mapModes.includes("nightmare")) {
                mapName = "nightmare-main-branch"
            } else if (mapModes.includes("apotheosis")) {
                mapName = this.info.ngp > 0 ? "apotheosis-new-game-plus" : "apotheosis"
                widthPW = 100
                if (this.player.names.some((x) => apothNames.includes(x))) {
                    mapName = "apotheosis-tuonela"
                }
            } else if (mapModes.includes("purgatory")) {
                mapName = "purgatory"
            } else if (mapModes.includes("biome-plus")) {
                mapName = "alternate-biomes"
            } else if (mapModes.includes("noitavania")) {
                mapName = this.info.ngp > 0 ? "noitavania-new-game-plus" : "noitavania"
            }

            // get map URL and topleft offsets in chunk coordinates
            let mapValues = this.mapData[mapName]
            if (!mapValues && mapName == "apotheosis") {
                mapName = "apotheosis-beta-branch"
                mapValues = this.mapData[mapName]
            }
            const map = {
                urls: mapValues.map((x) => x.url.replace(/\.dzi/, '_files/')),
            }
            const mapDZI = JSON.parse(mapValues[0].dziContent)
            map.x0 = Math.abs(mapDZI.Image.TopLeft.X) / 512
            map.y0 = Math.abs(mapDZI.Image.TopLeft.Y) / 512

            // Parallel world x-only calculation
            const PW = Math.sign(x) * Math.floor((Math.abs(x / 512) + widthPW / 2) / widthPW)
            let xMap = Math.floor(((x / 512) + map.x0 - widthPW * PW) / zoom)
            let xStar = -7 + ((x + (map.x0 - widthPW * PW) * 512) - (xMap * 4096)) * 192 / 4096
            let tileSelector = PW
            if (widthPW > tileWidth) {
                const tile = Math.sign(x) * Math.floor((Math.abs(x / 512) + tileWidth / 2) / tileWidth)
                xMap = Math.floor(((x / 512) + map.x0 - tileWidth * tile) / zoom)
                xStar = -7 + ((x + (map.x0 - tileWidth * tile) * 512) - (xMap * 4096)) * 192 / 4096
                tileSelector = tile
            }

            let src = map.urls[0]
            let pwName = "Main"
            if (tileSelector >= 1) {
                src = map.urls[2] ?? map.urls[0]
                pwName = "East"
            } else if (tileSelector <= -1) {
                src = map.urls[1] ?? map.urls[0]
                pwName = "West"
            }
            // Heaven/hell y-only calculation
            let HH = 0
            let hhName = ""
            // threshold for hell loops
            if (y > (yHell * 512)) {
                HH = Math.floor((y / 512 - yHell) / yLoop)
                hhName = ` Hell ${HH + 1}`
                // theshold for heaven loops
            } else if (y < (yHeaven * 512)) {
                HH = Math.ceil((y / 512 - yHeaven) / yLoop)
                hhName = ` Heaven ${Math.abs(HH) + 1}`
            }
            const yMap = Math.floor(((y / 512) + map.y0 - HH * yLoop) / zoom)
            const yStar = -6 + ((y + (map.y0 - yLoop * HH) * 512) - (yMap * 4096)) * 192 / 4096

            return {
                img: `${src}14/${xMap}_${yMap}.webp?v=1712752623`,
                name: mapLabels[mapName],
                url: `https://noitamap.com/?map=${mapName}&x=${x}&y=${y}&zoom=1200`,
                x: x.toLocaleString('en-US', { maximumFractionDigits: 2 }),
                y: y.toLocaleString('en-US', { maximumFractionDigits: 2 }),
                pw: (PW != 0) ? `${pwName} ${Math.abs(PW)}` : pwName,
                hh: hhName,
                xStar: xStar + 'px',
                yStar: yStar + 'px',
            }
        },
        start() {
            const date = new Date(this.info.start)
            const rantArr = secondsToTimeArray(this.info.idletime)
            const playArr = secondsToTimeArray(this.info.playtime)
            const dateStr = date.toLocaleDateString()
            const timeStr = date.toLocaleTimeString()
            const rantStr = rantArr.join(" ")
            const rantRatio = this.info.idletime / this.info.playtime * 100

            return {
                playtime: playArr.join(" "),
                over100: rantArr.length == 4 && rantArr[0] > 100,
                mainTime: `Run started on ${dateStr}\nat ${timeStr}`,
                tipTime: `Ranted for ${rantStr}\n(${rantRatio.toFixed(2)}% of runtime)`,
            }
        }
    },
    props: ['player', 'info', 'features'],
    inject: ['switches'],
    template: /* html */`
    <div class="preview" v-if="loaded">
        <div class="preview-icon-wrapper">
            <p class="preview-icon" :style="{ left: osd.xStar, top: osd.yStar }"><b>&#9733;</b></p>
        </div>
        <a :href="osd.url" tabindex="-1" target="_blank" rel="noopener noreferrer">
            <img :src="osd.img"/>
            <p class="preview-link">Click for Fullscreen Map</p>
        </a>
        <div class="preview-info">
            <!--<input v-model="input"/>-->
            <p v-if="!features.seed"><i>Seed Hidden</i></p>
            <p v-else-if="!seedInfo">No current run</p>
            <a v-else-if="seedInfo.url" :href="seedInfo.url" tabindex="1" target="_blank" rel="noopener noreferrer">
                <map-tooltip :main="'Map ' + seedInfo.seed" :tip="tipSeed"></map-tooltip>
            </a>
            <p v-else>Map {{ seedInfo.seed }}</p>
            <template v-if="features.pos">
                <p>x: {{ osd.x }}</p>
                <p>y: {{ osd.y }}</p>
            </template>
            <template v-else>
                <p><i>Position Hidden</i></p>
                <p><i>Map/PW tracker shows 0, 0</i></p>
            </template>
            <p v-if="features.ngp">In {{ osd.pw }}{{ osd.hh }} NG{{ info.ngp > 0 ? ('+' + info.ngp) : "" }}</p>
            <p v-else><i>NG+ Tracker Hidden</i></p>
            <p>World Type: {{ osd.name }}</p>
            <p>Playtime: {{ start.playtime }}</p>
            <map-tooltip v-if="!start.over100" :main="start.mainTime" :tip="start.tipTime"></map-tooltip>
        </div>
    </div>`
})

const mapTooltip = Vue.component('map-tooltip', {
    data() {
        return {
            tooltip: null,
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip, {
                placement: 'right',
                modifiers: [{ name: 'offset', options: { offset: [0, 5] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    methods: {
        updateTip() {
            if (this.tooltip) {
                this.tooltip.update()
            }
        },
    },
    props: ["main", "tip"],
    template: /* html */`
    <div ref="slot" class="shifts-tip" @mouseenter="updateTip">
        <p class="map-tip">{{ main }}</p>
        <div ref="tooltip" class="tooltip fit">
            <p class="map-tip">{{ tip }}</p>
        </div>
    </div>`
})

const fungalComp = Vue.component('fungal-comp', {
    data() {
        return {
            tooltip: null,
            state: {
                originalShift: false,
                hoverInfo: true,
                number: null,
            },
            rowToggles: [],
        }
    },
    mounted() {
        this.rowToggles = Array(this.shiftInfo.length).fill(false)
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip, {
                placement: 'top',
                modifiers: [{ name: 'offset', options: { offset: [0, 5] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        shiftInfo() {
            const transformed = {}
            const lastShift = {}
            const sequence = []

            let shiftsAll = []
            let nShifts = Math.min(Math.max(this.state.number ?? this.shifts.length, 1), this.number)
            if (!this.features.shifts) {
                nShifts = 0
            }
            for (let i = 0; i < nShifts; i++) {
                const shift = this.shifts[i]
                shiftsAll.push(shift.map((material, ioNumber) => {
                    if (ioNumber % 2) {
                        return material
                    }
                    const letter = (shift.length > 2) ? String.fromCharCode(97 + ioNumber / 2) : ""
                    return [(i + 1) + letter, material]
                }))
            }
            shiftsAll = shiftsAll.flat(Infinity)

            // const HOP = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

            let j = 0
            for (let i = 0; i < shiftsAll.length - 1; i += 3) {
                const shiftNumber = shiftsAll[i]
                const input = shiftsAll[i + 1]
                const original = shiftsAll[i + 2]
                const final = transformed[original] ?? { mat: original }
                transformed[input] = {
                    mat: final.mat,
                    j,
                }

                const shift = {
                    shiftNumber,
                    input,
                    output: {
                        original,
                        final: final.mat,
                    },
                    extra: { atShift: null, now: null },
                    cause: { output: null, extra: null },
                    isOverwritten: false,
                    j,
                };
                if (HOP(transformed, original)) {
                    shift.cause.output = transformed[original].j
                }

                if (HOP(transformed, final) && transformed[final] !== final) {
                    shift.extra.atShift = transformed[final].mat;
                }

                if (HOP(lastShift, input)) {
                    lastShift[input].isOverwritten = true
                }
                lastShift[input] = shift

                sequence.push(shift)
                j += 2
            }

            for (let i = 0; i < sequence.length; i++) {
                const shift = sequence[i]
                const final = shift.output.final
                if (HOP(transformed, final) && transformed[final].mat !== final) {
                    shift.extra.now = transformed[final].mat
                    shift.cause.extra = transformed[final].j
                }
            }

            return sequence
        },
    },
    methods: {
        highlight(cause, i) {
            if (cause.output != null) {
                [cause.output, cause.output + 1].forEach((cellIndex) => this.$refs.cells[cellIndex].classList.add('highlight'));
                [cause.output >> 1, i].forEach((cellIndex) => this.rowToggles.splice(cellIndex, 1, true));
            }
            if (cause.extra != null) {
                this.$refs.cells[cause.extra].classList.add('highlight');
                [cause.extra >> 1, i].forEach((cellIndex) => this.rowToggles.splice(cellIndex, 1, true));
            }
        },
        clear(causes, i) {
            Object.values(causes).forEach((cause) => {
                if (cause != null) {
                    [cause, cause + 1].forEach((cellIndex) => this.$refs.cells[cellIndex].classList.remove('highlight'));
                    [cause >> 1, i].forEach((cellIndex) => this.rowToggles.splice(cellIndex, 1, false));
                }
            });
        },
        updateTip() {
            if (this.tooltip) {
                this.tooltip.update()
            }
        },
    },
    props: ['shifts', 'timer', 'number', 'features'],
    template: /*html*/`
    <div class="shifts">
        <div class="shifts-header">
            <p v-if="features.timer"><b>Shift Timer:</b> {{ timer > 0 ? Math.floor(300 - timer) + ' seconds remaining' : 'Ready to Shift' }}</p>
            <p v-else><i>Fungal Timer Hidden</i></p>
            <template v-if="features.shifts">
                <v-switch v-model="state.originalShift" title="Show Original Shift in First Column"></v-switch>
                <div class=shifts-input>    
                    <span>Calculate up to Shift N =</span><input v-model="state.number" type="number" inputmode="numeric" min="1" :max="number" :placeholder="number"/>
                    <span>/ {{ number }} Total</span>
                </div>
            </template>
            <p v-else><i>Fungal Shift Info Hidden</i></p>
        </div>
        <div class="shifts-table">
            <div class="shifts-column">
                <div class="shifts-header-cell"><b>N</b></div>
                <div v-for="(shift,i) in shiftInfo">{{ shift.shiftNumber }}</div>
            </div>
            <div class="shifts-column">
                <div class="shifts-header-cell"><b>Input{{state.originalShift ? " &#8594; Raw Output" : "" }}</b></div>
                <div ref="cells" :class="{ strike: shift.isOverwritten }" v-for="(shift,i) in shiftInfo">
                    <mat-comp :material="shift.input" side="left"></mat-comp>
                    <template v-if="state.originalShift || rowToggles[i]">
                        &#8594; <mat-comp  :material="shift.output.original" :side="shift.output.original != shift.output.final ? 'top' : 'right'"></mat-comp>
                    </template>
                </div>
            </div>
            <div class="shifts-column">
                <div ref="slot" class="shifts-tip shifts-header-cell" @mouseenter="updateTip">
                    <b>Final Result</b>
                    <div ref="tooltip" class="tooltip fit">
                        <p>When Final Result lists two materials:</p>
                        <ul>
                            <li>Material 1 determines the visuals and material damage</li>
                            <li>Material 2 determines the stain and ingestion effects</li>
                        </ul>
                    </div>
                </div>
                <div ref="cells" :class="{ strike: shift.isOverwritten }" v-for="(shift,i) in shiftInfo" @mouseenter="highlight(shift.cause, i)" @mouseleave="clear(shift.cause, i)">
                    <template v-if="shift.extra.now">
                        <mat-comp :material="shift.output.final" :side="shift.cause.output ? 'bottom' : 'top'" :i="i" :info="shiftInfo"></mat-comp> +
                        <mat-comp  :material="shift.extra.now" side="right" :i="i" :info="shiftInfo"></mat-comp>
                    </template>
                    <template v-else-if="shift.output.original != shift.output.final">
                        <mat-comp :material="shift.output.final" side="right" :i="i" :info="shiftInfo"></mat-comp>
                    </template>
                    <template v-else>
                        <mat-comp :material="shift.output.original" :side="shift.output.original != shift.output.final ? 'top' : 'right'" :i="i" :info="shiftInfo"></mat-comp>
                    </template>
                </div>
            </div>
        </div>
    </div>`
})

const materialComp = Vue.component('mat-comp', {
    data() {
        return {
            tooltip: null,
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip, {
                placement: this.side,
                modifiers: [{
                    name: 'offset', options: {
                        offset: [
                            this.reasons.length > 0 ? 27 : 0,
                            this.side == 'left' ? 44.5 : 10
                        ]
                    }
                }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        mat() {
            let both = this.material.split("%@%")
            return {
                raw: both[0],
                ui: both[1],
            }
        },
        reasons() {
            if (!this.i) {
                return false
            }
            const shift = this.info[this.i]
            const reasons = []
            let reasonShift = {}
            if (shift.cause.output != null) {
                let cause = shift.cause.output >> 1
                reasonShift = this.info[cause]
                reasons.push({
                    shiftNumber: reasonShift.shiftNumber,
                    reason: `${reasonShift.input.split("%@%")[0]} → ${reasonShift.output.original.split("%@%")[0]}`,
                })
            }
            if (shift.cause.extra != null) {
                let cause = shift.cause.extra >> 1
                reasonShift = this.info[cause]
                reasons.push({
                    shiftNumber: reasonShift.shiftNumber,
                    reason: `${reasonShift.input.split("%@%")[0]} → ${reasonShift.output.original.split("%@%")[0]}`,
                })
            }
            return reasons
        },
    },
    methods: {
        updateTip() {
            if (this.tooltip) {
                this.tooltip.update()
            }
        },
    },
    props: {
        material: String,
        side: String,
        creatureShift: { type: String, required: false },
        i: { type: Number, required: false },
        info: { type: Array, required: false },
    },
    template: /*html*/`
    <div class="material tip" ref="slot" @mouseover="updateTip">
        <span>{{ mat.ui }}</span>
        <div class="tooltip fit" ref="tooltip">
            <p v-if="reasons.length > 0">{{ creatureShift ? "Creature" : "Material" }} ID: {{ mat.raw }}</p>
            <p v-else>{{ mat.raw }}</p>
            <p v-if="reasons.length > 0">Reasons: </p>
            <p v-for="reason in reasons">    {{ reason.shiftNumber }}: {{ reason.reason }}</p>
        </div>
    </div>`
})

const creatureShiftComp = Vue.component('creatureShift-comp', {
    data() {
        return {
            state: {
                originalShift: false,
                hoverInfo: true,
                number: null,
            },
            rowToggles: [],
        }
    },
    mounted() {
        this.rowToggles = Array(this.shiftInfo.length).fill(false)
    },
    computed: {
        shiftInfo() {
            const transformed = {}
            const lastShift = {}
            const sequence = []

            let shiftsAll = []
            let nShifts = Math.min(Math.max(this.state.number ?? this.shifts.length, 1), this.number)
            if (!this.features.apothCreatureShifts) {
                nShifts = 0
            }
            for (let i = 0; i < nShifts; i++) {
                const shift = this.shifts[i]
                shiftsAll.push(shift.map((material, ioNumber) => {
                    if (ioNumber % 2) {
                        return material
                    }
                    const letter = (shift.length > 2) ? String.fromCharCode(97 + ioNumber / 2) : ""
                    return [(i + 1) + letter, material]
                }))
            }
            shiftsAll = shiftsAll.flat(Infinity)

            // const HOP = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

            let j = 0
            for (let i = 0; i < shiftsAll.length - 1; i += 3) {
                const shiftNumber = shiftsAll[i]
                const input = shiftsAll[i + 1]
                const original = shiftsAll[i + 2]
                const final = transformed[original] ?? { mat: original }
                transformed[input] = {
                    mat: final.mat,
                    j,
                }

                const shift = {
                    shiftNumber,
                    input,
                    output: {
                        original,
                        final: final.mat,
                    },
                    // extra: { atShift: null, now: null },
                    cause: { output: null, },
                    isOverwritten: false,
                    j,
                };
                if (HOP(transformed, original)) {
                    shift.cause.output = transformed[original].j
                }

                // if (HOP(transformed, final) && transformed[final] !== final) {
                //     shift.extra.atShift = transformed[final].mat;
                // }

                if (HOP(lastShift, input)) {
                    lastShift[input].isOverwritten = true
                }
                lastShift[input] = shift

                sequence.push(shift)
                j += 2
            }

            for (let i = 0; i < sequence.length; i++) {
                const shift = sequence[i]
                const final = shift.output.final
                if (HOP(transformed, final) && transformed[final].mat !== final) {
                    shift.output.final = transformed[final].mat
                    shift.cause.output = transformed[final].j
                }
            }

            return sequence
        },
    },
    methods: {
        highlight(cause, i) {
            if (cause.output != null) {
                [cause.output, cause.output + 1].forEach((cellIndex) => this.$refs.cells[cellIndex].classList.add('highlight'));
                [cause.output >> 1, i].forEach((cellIndex) => this.rowToggles.splice(cellIndex, 1, true));
            }
        },
        clear(causes, i) {
            Object.values(causes).forEach((cause) => {
                if (cause != null) {
                    [cause, cause + 1].forEach((cellIndex) => this.$refs.cells[cellIndex].classList.remove('highlight'));
                    [cause >> 1, i].forEach((cellIndex) => this.rowToggles.splice(cellIndex, 1, false));
                }
            });
        },
    },
    props: ['shifts', 'timer', 'number', 'features'],
    template: /*html*/`
    <div class="shifts">
        <div class="shifts-header">
            <p v-if="features.apothCreatureTimer"><b>Shift Timer:</b> {{ timer > 0 ? Math.floor(300 - timer) + ' seconds remaining' : 'Ready to Shift' }}</p>
            <p v-else><i>Creature Timer Hidden</i></p>
            <template v-if="features.apothCreatureShifts">
                <v-switch v-model="state.originalShift" title="Show Original Shift in First Column"></v-switch>
                <div class=shifts-input>    
                    <span>Calculate up to Shift N =</span><input v-model="state.number" type="number" inputmode="numeric" min="1" :max="number" :placeholder="number"/>
                    <span>/ {{ number }} Total</span>
                </div>
            </template>
            <p v-else><i>Creature Shift Info Hidden</i></p>
        </div>
        <div class="shifts-table">
            <div class="shifts-column">
                <div class="shifts-header-cell"><b>N</b></div>
                <div v-for="(shift,i) in shiftInfo">{{ shift.shiftNumber }}</div>
            </div>
            <div class="shifts-column">
                <div class="shifts-header-cell"><b>Input{{state.originalShift ? " &#8594; Raw Output" : "" }}</b></div>
                <div ref="cells" :class="{ strike: shift.isOverwritten }" v-for="(shift,i) in shiftInfo">
                    <mat-comp creatureShift="true" :material="shift.input" side="left"></mat-comp>
                    <template v-if="state.originalShift || rowToggles[i]">
                        &#8594; <mat-comp creatureShift="true" :material="shift.output.original" :side="shift.output.original != shift.output.final ? 'top' : 'right'"></mat-comp>
                    </template>
                </div>
            </div>
            <div class="shifts-column">
                <div class="shifts-header-cell"><b>Final Result</b></div>
                <div ref="cells" :class="{ strike: shift.isOverwritten }" v-for="(shift,i) in shiftInfo" @mouseenter="highlight(shift.cause, i)" @mouseleave="clear(shift.cause, i)">
                    <template v-if="shift.output.original != shift.output.final">
                        <mat-comp creatureShift="true" :material="shift.output.final" side="right" :i="i" :info="shiftInfo"></mat-comp>
                    </template>
                    <template v-else>
                        <mat-comp creatureShift="true" :material="shift.output.original" :side="shift.output.original != shift.output.final ? 'top' : 'right'" :i="i" :info="shiftInfo"></mat-comp>
                    </template>
                </div>
            </div>
        </div>
    </div>`
})

const playerComp = Vue.component('player-comp', {
    data() {
        return {
            tipHP: null,
            tipGold: null,
            state: false,
        }
    },
    mounted() {
        if (this.$refs.tipHP)
            this.tipHP = Popper.createPopper(this.$refs.slotHP, this.$refs.tipHP, {
                placement: 'bottom',
            })
        if (this.$refs.tipGold)
            this.tipGold = Popper.createPopper(this.$refs.slotGold, this.$refs.tipGold, {
                placement: 'bottom',
            })
    },
    beforeDestroy() {
        if (this.tipHP) {
            this.tipHP.destroy()
            this.tipHP = null
        }
        if (this.tipGold) {
            this.tipGold.destroy()
            this.tipGold = null
        }
    },
    computed: {
        updateHealth() {
            const hpCheck = (hp, n) => {
                if (!hp.includes("e+")) return false
                const [frac, exp] = hp.split("e+")
                const big = BigInt(Math.ceil(frac * 1E3)) * (10n ** BigInt(exp - 3))
                return big >= n
            }
            const hpLarge = (hp) => {
                if (!hp.includes("e+")) return hp
                const [frac, exp] = hp.split("e+")
                return BigInt(Math.ceil(frac * 1E3)) * 25n * (10n ** BigInt(exp - 3))
            }
            const hpSpecial = (hp) => {
                return [/nan/i, /inf/i].some((x) => x.test(hp))
            }
            sciNotation = new Intl.NumberFormat(undefined, { notation: "scientific", })
            compNotation = new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 4 })

            const health = this.player.health
            // if (health.includes("NaN") || health.includes("inf")) {
            if (health.some((hp) => hpSpecial(hp)) || health.some((hp) => hpCheck(hp, 10n ** 308n))) {
                return {
                    type: "engine",
                    hp: `Engine ${health[0]}`,
                    maxHP: `Engine ${health[1]}`,
                    shortHP: `Engine ${health[0]}`,
                    shortMaxHP: `Engine ${health[1]}`,
                }
            }
            const out = {
                type: "game",
                hp: (health[0] * 25).toLocaleString(),
                maxHP: (health[1] * 25).toLocaleString(),
                shortHP: compNotation.format(health[0] * 25),
                shortMaxHP: compNotation.format(health[1] * 25),
            }
            if (health.some((hp) => hpCheck(hp, 9223372036854775808n))) {
                out.type = "inf"
            }
            if (health.some((hp) => hpCheck(hp, 10n ** 18n))) {
                out.hp = sciNotation.format(hpLarge(health[0]))
                out.maxHP = sciNotation.format(hpLarge(health[1]))
                out.shortHP = compNotation.format(hpLarge(health[0]))
                out.shortMaxHP = compNotation.format(hpLarge(health[1]))
            }
            return out

        },
        updatePlayer() {
            let player = this.player

            return {
                gold: (player.gold).toLocaleString('en-US'),
                finiteGold: player.gold < (2 ** 31) - 1,
                shortGold: Intl.NumberFormat('en-US', { notation: "compact" }).format(player.gold),
                names: player.names,
                amounts: player.amounts,
                orbs: player.orbs,
            }
        }
    },
    props: ['player'],
    template: /*html*/`
    <div class="info-wrapper">
        <div class="player-info">
            <div class="tip">
                <p v-if="updateHealth.type != 'inf'" class="health" ref="slotHP">{{ updateHealth.shortHP }} / {{ updateHealth.shortMaxHP }}</p>
                <p v-else class="health" ref="slotHP">&#8734; / &#8734;</p>
                <p class="tooltip fit" ref="tipHP">HP: {{ updateHealth.hp}} / {{ updateHealth.maxHP }}</p>
            </div>
            <div class="tip">
                <p v-if="updatePlayer.finiteGold" class="money" ref="slotGold">{{ updatePlayer.shortGold }}</p>
                <p v-else class="money" ref="slotGold">&#8734;</p>
                <p class="tooltip fit" ref="tipGold">$: {{ updatePlayer.gold}}</p>
            </div>
            <div class="tip">
                <p class="orb">{{ updatePlayer.orbs }}</p>
            </div>
            <v-switch v-model="state" title="Show All Perks"></v-switch>
            <perks-comp :names="updatePlayer.names" :amounts="updatePlayer.amounts" :state="state"></perks-comp>
        </div>
    </div>`
})

const perksComp = Vue.component('perks-comp', {
    computed: {
        playerPerks() {
            let perks = this.names.map((name, ind) => ({
                name: name,
                amount: this.amounts[ind],
            }))
            return {
                first8: perks.slice(0, 8),
                over8: perks.slice(8),
            }
        },
    },
    props: ['names', 'amounts', 'state'],
    template: /*html*/`
    <div class="perks">
    <perk-comp v-for="perk in playerPerks.first8" :key="perk.name" 
    :icon="perk"></perk-comp>
    <div v-if="!state && playerPerks.over8.length > 0" class="icon-slot no-bg more"></div>
    <perk-comp v-if="state" v-for="perk in playerPerks.over8" :key="perk.name" 
    :icon="perk"></perk-comp>
    </div>`
})

const perkComp = Vue.component('perk-comp', {
    data() {
        return {
            tooltip: null,
            url: null,
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip.$el, {
                placement: 'bottom',
                modifiers: [{ name: 'offset', options: { offset: [0, 10] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        tableObj() {
            const out = {}
            Object.keys(this.tables).forEach((x) => {
                out[x] = this.tables[x].reduce((obj, item) => {
                    obj[x == "perks" ? item.ui_name : item.id] = item
                    return obj
                }, {})
            })
            return out
        },
        isBackupImage() {
            return !HOP(this.tableObj.pseuds, this.icon.name)
        },
        getPerk() {
            if (HOP(this.tableObj.perks, this.icon.name)) {
                return this.tableObj.perks[this.icon.name]
            } else if (HOP(this.tableObj.pseuds, this.icon.name)) {
                return this.tableObj.pseuds[this.icon.name]
            } else if (this.icon.name.includes("creature_shift")) {
                creature = JSON.parse(JSON.stringify(this.tableObj.pseuds.creature_shift_ui))
                creature.id = this.icon.name
                return creature
            } else {
                const missing = JSON.parse(JSON.stringify(this.tableObj.pseuds.missingPerk))
                missing.id = this.icon.name
                return missing
            }
        },
        getImage() {
            // get image keys/b64 string
            const name = "$cs_base_" + this.icon.name.slice(41)
            const icon = this.tableObj.enemies[name.slice(9)]
            const frame = this.tableObj.pseuds.creature_shift_ui
            const iconB64 = 'data:image/png;base64,' + icon.image
            const frameB64 = 'data:image/png;base64,' + frame.image
            // apotheosis edge case for miniblob
            const offset = icon.id == "miniblob" ? -4 * 4 * 16 : 0
            if (this.icon.name.includes("creature_shift") && !HOP(this.tableObj.pseuds, this.icon.name)) {
                // initialize two 16x16 canvas contexts for pixel retrieval/manipulation
                let img = []
                let canvas = []
                let ctx = []
                for (let i = 0; i < 2; i++) {
                    img.push(document.createElement('img'))
                    canvas.push(document.createElement('canvas'))
                    canvas[i].width = 16
                    canvas[i].height = 16
                    ctx.push(canvas[i].getContext('2d'))
                }
                // initialize single pixel data arrays
                let frameBGColor = []
                let frameCleanColor = []
                let iconArray = []
                let rgbaChannels = [0, 1, 2, 3]
                // extract background frame data
                img[0].src = iconB64
                img[0].onload = () => {
                    ctx[0].drawImage(img[0], 0, 0)

                    let imageData = ctx[0].getImageData(0, 0, canvas[0].width, canvas[0].height)
                    let data = imageData.data

                    iconArray = [...data]
                    img[1].src = frameB64
                }
                // compose creature shift icon image
                img[1].onload = () => {
                    ctx[1].drawImage(img[1], 0, 0)
                    let imageData1 = ctx[1].getImageData(0, 0, canvas[1].width, canvas[1].height)
                    let data1 = imageData1.data
                    frameBGColor = rgbaChannels.slice(0, 3).map((ch) => data1[xyToIndex(5, 4, 16) + ch])
                    frameCleanColor = rgbaChannels.map((ch) => data1[xyToIndex(5, 2, 16) + ch])

                    for (let i = 0; i < data1.length; i += 4) {
                        const [x, y] = indexToXY(i, 16)
                        // let resPix = false
                        if ((x > 3 && y > 2) && (x < 13 && y < 12)) {
                            // let iconPix = [iconArray[i], iconArray[i + 1], iconArray[i + 2]]
                            let iconPix = iconArray.slice(i, i + 4)
                            let a = iconArray[i + 3] / 255
                            for (let ch = 0; ch < 4; ch++) {
                                if (a < 1 && a > 0) {
                                    data1[i + ch + offset] = Math.ceil(frameBGColor[ch] * (1 - a) + iconPix[ch] * a)
                                    if (ch == 3) {
                                        data1[i + ch + offset] = 0xFF
                                    }
                                } else if (iconPix.every((x) => x != 0)) {
                                    data1[i + ch + offset] = iconPix[ch]
                                }
                            }
                        }
                    }
                    let cleanup = [
                        [4, 3],
                        [12, 3],
                        [4, 11],
                        [12, 11],
                    ].map((xy) => xyToIndex(...xy, 16))
                    cleanup.forEach((i) => {
                        for (let ch = 0; ch < 4; ch++) {
                            data1[i + ch] = frameCleanColor[ch]
                        }
                    })
                    ctx[1].putImageData(imageData1, 0, 0)
                    this.url = canvas[1].toDataURL()
                }
            }
            return this.url
        }
    },
    props: ['icon'],
    inject: ['tables'],
    template: /*html*/`
    <div class="icon-slot no-bg">
        <div class="zoom no-bg">
            <a v-if="getPerk.wiki_url" :href="getPerk.wiki_url" tabindex="-1" target="_blank" rel="noopener noreferrer">
                <img v-if="icon.name.includes('creature_shift') && isBackupImage" ref="slot" :src="getImage"/>
                <img v-else ref="slot" :src="'data:image/png;base64,' + (getPerk.ui_img ? getPerk.ui_img : getPerk.image)"/>
            </a>
            <template v-else>
                <img v-if="icon.name.includes('creature_shift') && isBackupImage" ref="slot" :src="getImage"/>
                <img v-else ref="slot" :src="'data:image/png;base64,' + (getPerk.ui_img ? getPerk.ui_img : getPerk.image)"/>
            </template>
            </div>
        <perk-tooltip v-if="icon.name.includes('creature_shift') && isBackupImage" 
            ref="tooltip" :icon="getPerk" :amount="icon.amount" :name="icon.name" :src="getImage"></perk-tooltip>
        <perk-tooltip v-else 
            ref="tooltip" :icon="getPerk" :amount="icon.amount" :name="icon.name" :src="'data:image/png;base64,' + (getPerk.ui_img ? getPerk.ui_img : getPerk.image)"></perk-tooltip>
    </div>`,
})

const perkTooltip = Vue.component('perk-tooltip', {
    computed: {
        desc() {
            if (this.icon.description) {
                return this.icon.description.replace(/\\n/g, '<br>')
            }
            return null
        },
    },
    props: ['icon', 'amount', 'name', 'src'],
    template: /*html*/`
    <div class="tooltip">
        <p class="tooltip-title">{{ amount }} x {{ icon.name }}</p>
        <p class="tooltip-wiki">({{ icon.id }})</p>
        <div class="desc-container">
            <p v-if="icon.description" class="tooltip-description" v-html="desc"></p>
            <img :src="src"/>
        </div>
    </div>`,
})

const containerComp = Vue.component('wands-container', {
    data() {
        return {
            ws: null,
            fKeys: [],
            retryTimeout: null,
            retries: 0,
            currentVersion: currentVersion,
            modVersion: streamerModVersion,
            features: streamerModFeatures,
            wands: streamerWands,
            inventory: streamerInventory,
            items: streamerItems,
            progress: streamerProgress,
            runInfo: streamerRunInfo,
            apothInfo: streamerApothInfo,
            playerInfo: streamerPlayerInfo,
            newData: null,
            switches: {
                progressTable: {
                    state: false,
                    label: 'Show Progress Table',
                    className: 'progress-table',
                },
                pillars: {
                    state: false,
                    label: "Show Pillars",
                    className: "pillars-label",
                },
                autoRefresh: {
                    state: true,
                    label: 'Auto Refresh Data',
                    className: 'pause-updates',
                },
                showAll: { state: false, label: 'Show All Progress', className: 'show-all' },
                flipHidden: { state: false, label: 'Invert Highlighted', className: 'flip-hidden' },
                betaContent: {
                    // until nolla starts pushing new betas disable this feature (also hidden in css)
                    // state: streamerVersion.indexOf('beta') > -1,
                    state: true,
                    label: 'Show Beta Content',
                    className: 'beta-content',
                },
                apothContent: {
                    state: streamerRunInfo.mods.some(mod => /apotheosis/i.test(mod)),
                    label: 'Show Apotheosis Content',
                    className: 'apoth-content',
                },
            },
            progTables: false,
        }
    },
    created() {
        this.genKeys()
        if (!this.ws) {
            this.connect()
        }
    },
    provide() {
        return {
            switches: this.switches,
            tables: {
                perks: this.dataVersion.icons.perks,
                pseuds: this.dataVersion.icons.pseuds,
                enemies: this.dataVersion.icons.enemies,
            },
            features: this.features,
        }
    },
    computed: {
        dataVersion() {
            const progress = {
                perks: [],
                spells: [],
                enemies: [],
                pillars: [],
                ...this.progress,
            }
            let enemies = icons.enemies.filter((x) => !x.beta)
            let out = {
                icons: {
                    perks: icons.perks,
                    spells: icons.spells.filter((x) => HOP(spellDataMain, x.id)),
                    enemies: enemies,
                },
                prog: {
                    perks: progress.perks,
                    spells: progress.spells.filter((x) => HOP(spellDataMain, x)),
                    enemies: progress.enemies.filter((x) => enemies.map((y) => y.id).includes(x)),
                },
            }
            if (this.switches.betaContent.state) {
                out = {
                    icons: icons,
                    prog: {
                        perks: progress.perks.filter((x) =>
                            icons.perks.map((y) => y.id).includes(x),
                        ),
                        spells: progress.spells.filter((x) => HOP(spellData, x)),
                        enemies: progress.enemies.filter((x) =>
                            icons.enemies.map((y) => y.id).includes(x),
                        ),
                    },
                }
            }
            if (this.switches.apothContent.state) {
                out = {
                    icons: apothIcons,
                    prog: {
                        perks: progress.perks.filter((x) =>
                            apothIcons.perks.map((y) => y.id).includes(x),
                        ),
                        spells: progress.spells.filter((x) => HOP(spellDataApoth, x)),
                        enemies: progress.enemies.filter((x) =>
                            apothIcons.enemies.map((y) => y.id).includes(x),
                        ),
                    },
                }
            }
            out.pillars = progress.pillars
            return out
        },
        tables() {
            return [
                { name: 'Perks', col: 9, data: this.dataVersion.icons.perks },
                { name: 'Spells', col: 12, data: this.dataVersion.icons.spells },
                {
                    name: 'Enemies',
                    col: 9,
                    data: this.dataVersion.icons.enemies.filter((x) => x.id != 'turret_right'),
                },
            ]
        },
    },
    watch: {
        switches: {
            handler: function (newVal, oldVal) {
                if (newVal.autoRefresh.state && this.newData !== null) {
                    this.updateData(this.newData)
                    this.newData = null
                }
                if (newVal.progressTable.state) {
                    setTimeout(() => {
                        this.progTables = true
                    }, 0)
                } else if (!newVal.progressTable.state) {
                    setTimeout(() => {
                        this.progTables = false
                    }, 0)
                }
            },
            deep: true,
        },
    },
    methods: {
        genKeys() {
            this.fKeys = this.wands.map((v) => 1000 + Math.random() * 9999)
        },
        updateData(data) {
            this.modVersion = data.modVersion
            this.features = data.modFeatures
            this.wands = data.wands
            this.inventory = data.inventory
            this.items = data.items
            this.progress = data.progress
            this.runInfo = data.runInfo
            this.apothInfo = data.apothInfo
            this.playerInfo = data.playerInfo
            this.genKeys()
        },
        connect() {
            const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
            this.ws = new WebSocket(`${scheme}://${window.location.host}/client=${streamerName}`)
            this.ws.onopen = () => { }
            this.ws.onmessage = (msg) => {
                try {
                    const data = JSON.parse(msg.data)
                    // console.log(data)
                    if (data.type == 'wands') {
                        if (this.switches.autoRefresh.state) {
                            this.updateData(data)
                        } else {
                            this.newData = data
                        }
                    }
                } catch (err) { }
            }
            this.ws.onclose = () => {
                if (this.retries >= 10) {
                    return
                }
                clearTimeout(this.retryTimeout)
                this.retryTimeout = setTimeout(() => {
                    this.connect()
                    this.retries++
                }, 3500)
            }
        },
    },
    template: /*html*/`
    <div class="content">
    <div class="top-wrapper">
    <div v-if="modVersion != currentVersion" class="outdated">
                <p>Streamer is running outdated version: {{ modVersion }}</p>
                <p>Modules will probably break, please update to version: {{ currentVersion }} </p>
                <p>Note: If you just installed the mod try refreshing the page after you load into Noita with the mod enabled</p>
            </div>
            <div class="inventory-wrapper">
                <spell-inv :spells="inventory" :items="items"></spell-inv>
            </div>
            <player-comp :player="playerInfo"></player-comp>
        </div>
        <div class="wands-wrapper">
            <wand-comp v-for="(wand, i) in wands" :key="fKeys[i]" :stats="wand.stats" :ac="wand.always_cast" :deck="wand.deck"></wand-comp>
        </div>
        <div class="disclaimer">
            <world-comp :apoth="apothInfo" :player="playerInfo" :run="runInfo" :features="features"></world-comp>
        </div>
        <div class="switches">
            <div v-if="switches.progressTable.state ^ progTables" class="loader"></div>
            <v-switch v-for="(sw, i) in switches" :key="i" v-model="sw.state" :title="sw.label" :class="sw.className"></v-switch>
        </div>
        <div v-if="switches.pillars.state">
            <pillars-comp :pillarProgress="dataVersion.pillars"></pillars-comp>
        </div>
        <div v-if="progTables" class="prog-wrapper">
            <div class="top-border"></div>
            <prog-comp
                v-for="(table, i) in this.tables"
                :key="i"
                :tName="table.name"
                :col="table.col"
                :tableIcons="table.data"
                :tableProg="dataVersion.prog[table.name.toLowerCase()]"
            ></prog-comp>
        </div>
    </div>`,
})

const pillarsComp = Vue.component('pillars-comp', {
    data() {
        return {
            apothState: false,
        }
    },
    computed: {
        info() {
            const pillarVersion = this.apothState ? pillarsApoth : pillars
            const lengths = pillarVersion.map((x) => x.length - 1)
            return {
                pillarVersion,
                headers: pillarVersion.map((x) => x[0].name),
                spacing: lengths.map((x) => Math.max(...lengths) - x),
            }
        },
        progress() {
            /**
             * Summarize the progress of a single pillar
             * 
             * @param {{key: string, icon: string, name: string}[]} pillarData
             * @return {{progress: boolean[], current: number, total: number}}
             */
            const pillarSummary = (pillarData) => {
                /** @var {string[]} flags */
                const flags = this.pillarProgress;
                let count = 0
                const progress = []
                for (const data of pillarData) {
                    const unlocked = flags.includes(data.key)
                    progress.push(unlocked)
                    if (unlocked) count++
                }
                return {
                    progress,
                    current: count,
                    // pillarData includes top pillar image, don't count it in total
                    total: pillarData.length - 1,
                }
            }
            const allProgress = [];
            const allCounts = [];
            let totalCount = 0;
            let totalTotal = 0;
            for (const pillarData of this.info.pillarVersion) {
                const { progress, ...counts } = pillarSummary(pillarData);
                allProgress.push(progress)
                allCounts.push(counts)
                totalCount += counts.current;
                totalTotal += counts.total;
            }
            return {
                progress: allProgress,
                list: allCounts,
                overall: `${totalCount} / ${totalTotal}`,
            }
        },
    },
    props: ['pillarProgress'],
    inject: ['switches'],
    template: /*html*/`
    <div class="pillars-wrapper">
        <div class="pillars-header">
            <div class="top-border"></div>
            <div class="pillars-header-text">
                <v-switch v-if="switches.apothContent.state" v-model="apothState" title="Show Apotheosis Pillars"></v-switch>
                <p>Total: {{ progress.overall }}</p>
            </div>
        </div>
        <div class="pillars">
            <div class="pillar" v-for="(pillar,i) in info.pillarVersion" :key="'pillar' + i">
                <p class="pillars-header">{{ progress.list[i].current }} / {{ progress.list[i].total }}</p>
                <div class="spacer" v-for="j in info.spacing[i]" :key="'space' + j"></div>
                <pillar-cell 
                    v-for="(cell,k) in pillar" 
                    :key="'cell' + k" 
                    :cell="cell"
                    :header="k ? info.headers[i] : false"
                    :progress="progress.progress[i][k]"
                    :complete="progress.list[i].current == progress.list[i].total"
                    ></pillar-cell>
            </div>
        </div>
    </div>`,
})

const pillarCell = Vue.component('pillar-cell', {
    data() {
        return {
            tooltip: null,
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip, {
                placement: 'right',
                modifiers: [{ name: 'offset', options: { offset: [10, 50] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    methods: {
        updateTip() {
            if (this.tooltip) {
                this.tooltip.update()
            }
        },
    },
    props: ['cell', 'header', 'progress', 'complete'],
    inject: ['switches'],
    template: /*html*/`
    <div class="pillar-cell" :class="{ 'pillar-zoom': header }">
        <img 
            ref="slot" 
            :src="'data:image/png;base64,' + cell.icon" 
            @mouseenter="updateTip"
            :class="{ 'pillar-dark': !(progress || complete) ^ switches.flipHidden.state }"
        />
        <div v-if="header" ref="tooltip" class="tooltip">
            <p>{{ header }}:</p>
            <p>{{ cell.name }}</p>
            <p v-if="cell.desc">{{ cell.desc }}</p>
        </div>
    </div>`
})

const Progress = Vue.component('prog-comp', {
    data() {
        return {
            tooltip: null,
            search: '',
            selected: -1,
            tip: {
                Perks: 'Search by perk name or ID',
                Spells: "Search by spell name, ID, or search by @tooltip such as: '@cast<0' or '@type=static'",
                Enemies:
                    'Search by enemy name or ID, all icons try to link to wiki, but not all pages exist (or are name-matched)',
            },
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip, {
                placement: 'top',
                modifiers: [{ name: 'offset', options: { offset: [0, 5] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        spellVersion() {
            let out = spellDataMain
            if (this.switches.betaContent.state) {
                out = spellData
            }
            if (this.switches.apothContent.state) {
                out = spellDataApoth
            }
            return out
        },
        perc() {
            return ((100 * this.tableProg.length) / this.tableIcons.length).toFixed(1)
        },
    },
    methods: {
        filterIcons() {
            let spells = this.spellVersion
            // short hand key/value pairs for searching
            let meta = {
                type: ['action_type'],
                'uses remaining': ['action_max_uses'],
                'mana drain': ['action_mana_drain'],
                damage: ['action_projectile', 'damage_projectile_add'],
                'dmg. ice': ['action_ice', 'damage_ice_add'],
                'dmg. slice': ['action_slice'],
                'dmg. drill': ['action_drill'],
                'dmg. fire': ['action_fire'],
                'dmg. healing': ['action_healing'],
                'dmg. holy': ['action_holy'],
                'dmg. melee': ['action_melee'],
                'dmg. electric': ['action_electricity', 'damage_electricity_add'],
                speed: ['action_speed', 'speed_multiplier'],
                'cast delay': ['fire_rate_wait'],
                'proj. speed': ['speed_multiplier'],
                'recharge time': ['reload_time'],
                'dmg. expl': ['action_explosion', 'damage_explosion_add'],
                'expl. radius': ['explosion_radius'],
                bounces: ['bounces'],
                spread: ['spread_degrees'],
                'crit. chance': ['damage_critical_chance'],
            }
            // more short hand keys, value is index
            let types = [
                'projectile',
                'static projectile',
                'projectile modifier',
                'multicast',
                'material',
                'other',
                'utility',
                'passive',
            ]
            // dmg values need to be multiplied by 25 to match up with UI
            let dmg25 = [
                'action_healing',
                'action_holy',
                'action_melee',
                'action_fire',
                'action_projectile',
                'damage_projectile_add',
                'action_slice',
                'action_drill',
                'action_ice',
                'action_electricity',
                'action_explosion',
                'damage_ice_add',
                'damage_electricity_add',
                'damage_explosion_add',
            ]
            // delay values need to be mutliplied by 60 to match up with UI
            let delay = ['reload_time', 'fire_rate_wait']
            this.selected = 0
            // not gonna lie, this search function is a horror monster and proves
            // i'm bad at coding
            this.tableIcons.forEach((icon) => {
                const id = icon.id.toLowerCase()
                const name = icon.name.toLowerCase()
                const search = this.search.toLowerCase()
                const el = this.$refs[icon.id][0].$el
                if (this.tName == 'Spells') {
                    var spell = spells[icon.id].meta
                }
                el.classList.remove('highlight')

                // check if we are searching name/id or searching by @meta property
                if (search[0] == '@') {
                    const metaSearch = search.substring(1)
                    const metaKeys = Object.keys(meta)
                    const metaInd = metaKeys.findIndex((x) =>
                        x.match(new RegExp(metaSearch.split(/[=><]/)[0])),
                    )

                    if (!meta[metaKeys[metaInd]]) return
                    const keys = meta[metaKeys[metaInd]]
                    const re = new RegExp('[><][d.-]*')
                    if (keys.some((key) => HOP(spell, key))) {
                        // check if current spell has the meta property we are searching by
                        if (/type=\w+/.test(metaSearch)) {
                            // check if we are searching by spell type
                            const keyVal = metaSearch.split(/=+/)
                            if (!keyVal[1]) return
                            const valInd = types.findIndex((x) => x.match(new RegExp(keyVal[1])))
                            if (spell.action_type == valInd) {
                                this.selected++
                                el.classList.remove('searchHide')
                                el.classList.add('highlight')
                            } else {
                                el.classList.add('searchHide')
                            }
                        } else if (re.test(metaSearch)) {
                            // otherwise we are searching by a meta property
                            const parts = metaSearch.split(/([><])+/)
                            if (!parts[2]) return
                            const cmpFilter = keys.filter((key) => HOP(spell, key))
                            let val = parseFloat(parts[2])
                            if (dmg25.indexOf(keys[0]) > -1) {
                                val *= 25
                            } else if (delay.indexOf(keys[0]) > -1) {
                                val *= 60
                            }
                            // check for > or < after meta property declaration
                            if (
                                cmpFilter &&
                                (parts[1] == '>' ? spell[keys[0]] > val : spell[keys[0]] < val)
                            ) {
                                this.selected++
                                el.classList.remove('searchHide')
                                el.classList.add('highlight')
                            } else {
                                el.classList.add('searchHide')
                            }
                        } else {
                            el.classList.remove('searchHide')
                            this.selected++
                            el.classList.add('highlight')
                        }
                    } else {
                        el.classList.add('searchHide')
                    }
                } else if ([id, name].some((x) => x.indexOf(search) > -1)) {
                    // id or name search
                    this.selected++
                    el.classList.remove('searchHide')
                    if (search.length > 0) {
                        el.classList.add('highlight')
                    }
                } else {
                    el.classList.add('searchHide')
                }
                // reset found counter
                if (!search.length) this.selected = -1
            })
        },
    },
    props: ['tName', 'col', 'tableIcons', 'tableProg'],
    inject: ['switches'],
    template: /*html*/`
    <div class="prog" :style="{width : 1.85 * col + 'rem'}">
        <div ref="slot" class="header">
            <div class="stats-wrap">
                <div class="stats">
                    <span>{{ tName }} - {{ perc }}%</span>
                    <span>{{ tableProg.length }}/{{ tableIcons.length }}</span>
                    <span v-if="selected != -1">({{ selected }} found)</span>
                </div>
                <div class="tip">
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAg0lEQVR4nGP8//8/AymABZnDyMjIkJ2YcRxZbOr8GZbIhqJoyE7MOP7y+UsGdDEGBgZLGJ8JWRKmeM2O9ZZrdqy3RBbDagNMET7AhEsC5hcMQ/7//w/HyIpDPAKPY1OD1QZ0dyMDRmSTGRkZsSpCVoPVhuzEjOPo8QEDLNgEiXYSMQAA+jlJnW6J0BUAAAAASUVORK5CYII="/>
                    <div ref="tooltip" class="tooltip">
                        <p>{{ tip[tName] }}</p>
                    </div>
                </div>
            </div>
            <div class="search-wrap">
                <input class="search" type="text" v-model="search" tabindex="1" :placeholder="'Search ' + tName" @keyup="filterIcons"/>
            </div>
        </div>
        <div class="spells">
            <icon-comp
                v-for="icon in tableIcons"
                :key="icon.id"
                :icon="icon"
                :tName="tName"
                :ref="icon.id"
                :boolProg="(tableProg.includes(icon.id) || switches.showAll.state) ^ switches.flipHidden.state"
            ></icon-comp>
        </div>
    </div>`,
})

const IconComp = Vue.component('icon-comp', {
    data() {
        return {
            tooltip: null,
            names: {
                Enemies: 'Enemy',
                Spells: 'Spell',
                Perks: 'Perk',
            },
            bgStyle: {
                width: '38px',
                height: '38px',
                left: '-1px',
                top: '-1px',
                opacity: '0.5',
            },
        }
    },
    mounted() {
        if (this.$refs.tooltip) {
            this.tooltip = Popper.createPopper(this.$refs.slot, this.$refs.tooltip.$el, {
                placement: 'bottom',
                modifiers: [{ name: 'offset', options: { offset: [0, 35] } }],
            })
        }
    },
    beforeDestroy() {
        if (this.tooltip) {
            this.tooltip.destroy()
            this.tooltip = null
        }
    },
    computed: {
        spell() {
            if (this.tName != "Spells") return false
            const id = this.icon.id

            let data = spellDataMain
            let img = icons.spells.filter((x) => HOP(spellDataMain, x.id))
            if (this.switches.betaContent.state) {
                data = spellData
                img = icons.spells
            }
            if (this.switches.apothContent.state) {
                data = spellDataApoth
                img = apothIcons.spells
            }
            let keyedImages = img.reduce((obj, item) => Object.assign(obj, { [item.id]: item }), {})
            const missing = {
                name: id,
                description: "Either this spell is missing from onlywands or it is modded and onlywands doesn't support this mod yet",
                sprite: icons.pseuds.find((x) => x.id == "missingSpell").image,
            }
            return {
                id: id,
                img: (HOP(keyedImages, id) ? keyedImages[id] : icons.pseuds.find((x) => x.id == "missingSpell")),
                data: (HOP(data, id) ? data[id] : missing),
            }
        },
    },
    props: ['icon', 'tName', 'boolProg'],
    inject: ['switches'],
    template: /*html*/`
    <div class="icon-slot" :class="[{ bgHide : !boolProg }, {spellTip : tName=='Spells'}]">
        <div class="zoom">
            <img v-if="icon.bgImage" :style="bgStyle" :src="'data:image/png;base64,' + icon.bgImage"/>
            <a v-if="icon.wiki_url" :href="icon.wiki_url" tabindex="-1" target="_blank" rel="noopener noreferrer">
                <img ref="slot" :src="'data:image/png;base64,' + icon.image"/>
            </a>
            <img v-else ref="slot" :src="'data:image/png;base64,' + icon.image"/>
        </div>
        <spell-tooltip v-if="tName=='Spells'" ref="tooltip" :spell="spell"></spell-tooltip>
        <icon-tooltip v-else ref="tooltip" :icon="icon"></icon-tooltip>
    </div>`,
})

const IconTooltip = Vue.component('icon-tooltip', {
    computed: {
        desc() {
            if (this.icon.description) {
                return this.icon.description.replace(/\\n/g, '<br>')
            }
            return null
        },
    },
    props: ['icon'],
    template: /*html*/`
    <div class="tooltip">
        <p class="tooltip-title">{{ icon.name }}</p>
        <p class="tooltip-wiki">({{ icon.id }})</p>
        <div class="desc-container">
            <p v-if="icon.description" class="tooltip-description" v-html="desc"></p>
            <img :src="'data:image/png;base64,' + icon.image"/>
        </div>
    </div>`,
})

const vSwitch = Vue.component('v-switch', {
    props: {
        value: { type: Boolean, required: true },
        title: { type: String, required: true },
        disabled: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            content: false,
        }
    },
    methods: {
        handleInput() {
            this.content = this.$refs.input.checked
            this.$emit('input', this.content)
        },
    },
    template: /*html*/`
    <div class="switch-group">
        <label class="switch">
            <input :disabled="disabled" type="checkbox" ref="input" @input="handleInput" :checked="value" tabindex="1"/>
            <span class="slider round"></span>
        </label>
        <slot></slot>
        <span>{{ title }}</span>
    </div>`,
})

const SpellInventory = Vue.component('spell-inv', {
    computed: {
        slots() {
            let s = Array(16).fill('0')
            for (const [i, spell] of this.spells.entries()) {
                s[i] = spell
            }
            return s
        },
        itemSlots() {
            let s = Array(4).fill('0')
            for (const [i, spell] of this.items.entries()) {
                s[i] = spell
            }
            return s
        },
    },
    props: ['spells', 'items'],
    inject: ['switches'],
    template: /*html*/`
    <div class="inventory">
        <item-slot v-for="(v, i) in itemSlots" :item="itemSlots[i]" :key="i+20"></item-slot>
        <spell-slot v-for="(v, index) in slots" :spell="slots[index]" :key="index"></spell-slot>
    </div>`,
})

const SpellTooltip = Vue.component('spell-tooltip', {
    data() {
        return {
            types: [
                'Projectile',
                'Static Projectile',
                'Proj. modifier',
                'Multicast',
                'Material',
                'Other',
                'Utility',
                'Passive',
            ],
            stats: [
                {
                    label: 'Type',
                    classes: 'crisp action-type',
                    key: 'action_type',
                },
                {
                    label: 'Uses remaining',
                    classes: 'crisp max-uses',
                    key: 'action_max_uses',
                },
                {
                    label: 'Mana drain',
                    classes: 'crisp mana-drain',
                    key: 'action_mana_drain',
                },
                {
                    label: 'Damage',
                    classes: 'crisp dmg-projectile',
                    key: 'action_projectile',
                },
                {
                    label: 'Dmg. Slice',
                    classes: 'crisp dmg-slice',
                    key: 'action_slice',
                },
                {
                    label: 'Dmg. Drill',
                    classes: 'crisp dmg-drill',
                    key: 'action_drill',
                },
                {
                    label: 'Dmg. Ice',
                    classes: 'crisp dmg-ice',
                    key: 'action_ice',
                },
                {
                    label: 'Dmg. Ice',
                    classes: 'crisp dmg-ice',
                    key: 'damage_ice_add',
                },
                {
                    label: 'Dmg. Fire',
                    classes: 'crisp dmg-fire',
                    key: 'action_fire',
                },
                {
                    label: 'Dmg. Healing',
                    classes: 'crisp dmg-healing',
                    key: 'action_healing',
                },
                {
                    label: 'Dmg. Holy',
                    classes: 'crisp dmg-holy',
                    key: 'action_holy',
                },
                {
                    label: 'Dmg. Melee',
                    classes: 'crisp dmg-melee',
                    key: 'action_melee',
                },
                {
                    label: 'Dmg. Electric',
                    classes: 'crisp dmg-electric',
                    key: 'action_electricity',
                },
                {
                    label: 'Dmg. Electric',
                    classes: 'crisp dmg-electric',
                    key: 'damage_electricity_add',
                },
                {
                    label: 'Speed',
                    classes: 'crisp speed-mult',
                    key: 'action_speed',
                },
                {
                    label: 'Cast delay',
                    classes: 'crisp cast-delay',
                    key: 'fire_rate_wait',
                },
                {
                    label: 'Proj. Speed',
                    classes: 'crisp speed-mult',
                    key: 'speed_multiplier',
                },
                {
                    label: 'Recharge time',
                    classes: 'crisp recharge-time',
                    key: 'reload_time',
                },
                {
                    label: 'Dmg. Expl',
                    classes: 'crisp dmg-explosion',
                    key: 'action_explosion',
                },
                {
                    label: 'Expl. Radius',
                    classes: 'crisp explosion-radius',
                    key: 'explosion_radius',
                },
                {
                    label: 'Dmg. Expl',
                    classes: 'crisp dmg-explosion',
                    key: 'damage_explosion_add',
                },
                {
                    label: 'Bounces',
                    classes: 'crisp bounces',
                    key: 'bounces',
                },
                {
                    label: 'Spread',
                    classes: 'crisp wand-spread',
                    key: 'spread_degrees',
                },
                {
                    label: 'Crit. Chance',
                    classes: 'crisp dmg-crit-chance',
                    key: 'damage_critical_chance',
                },
                {
                    label: 'Damage',
                    classes: 'crisp dmg-projectile',
                    key: 'damage_projectile_add',
                },
            ],
        }
    },
    props: ['spell'],
    computed: {
        name() {
            let name = this.spell.data.name
            return name ? name.toUpperCase() : 'UNKNOWN'
        },
        meta() {
            const m = {}
            let data = this.spell.data && this.spell.data.meta
            const keys = this.stats.map((x) => x.key)
            if (!data) {
                return m
            }
            for (const key of keys) {
                const prop = data[key]
                if (typeof prop == 'undefined') {
                    continue
                }

                switch (key) {
                    case 'action_type':
                        m[key] = this.types[prop]
                        break
                    case 'action_healing':
                    case 'action_holy':
                    case 'action_melee':
                    case 'action_fire':
                    case 'action_projectile':
                        m[key] = Math.ceil(prop * 25)
                        break
                    case 'damage_projectile_add':
                        m[key] = `${prop > 0 ? '+' : ''}${Math.ceil(prop * 25)}`
                        break
                    case 'action_slice':
                    case 'action_drill':
                    case 'action_ice':
                    case 'action_electricity':
                    case 'action_explosion':
                        m[key] = Math.floor(prop * 25)
                        break
                    case 'damage_ice_add':
                    case 'damage_electricity_add':
                    case 'damage_explosion_add':
                        m[key] = `${prop > 0 ? '+' : ''}${Math.floor(prop * 25)}`
                        break
                    case 'speed_multiplier':
                        m[key] = prop > 1 || prop < 1 ? `x ${prop.toFixed(2)}` : undefined
                        break
                    case 'fire_rate_wait':
                    case 'reload_time':
                        m[key] = `${prop > 0 ? '+' : ''}${(prop / 60)
                            .toFixed(2)
                            .replace('.00', '.0')} s`
                        break
                    case 'spread_degrees':
                        m[key] = `${prop > 0 ? '+' : ''}${prop.toFixed(0)} DEG`
                        break
                    case 'bounces':
                        m[key] = `${prop > 0 ? '+' : ''}${prop}`
                        break
                    case 'damage_critical_chance':
                        m[key] = `${prop > 0 ? '+' : ''}${prop}%`
                        break
                    default:
                        m[key] = prop
                        break
                }
            }
            return m
        },
    },
    template: /*html*/`
    <div class="tooltip">
        <p class="tooltip-title">{{name}}</p>
        <p class="tooltip-description">{{spell.data.description}}</p>
        <template v-for="(stat, index) in stats">
            <p v-if="typeof meta[stat.key] != 'undefined'" :key="stat.key" :class="stat.classes">
            {{stat.label}} <span>{{meta[stat.key]}} </span> </p>
            <br v-if="(index + 1) % 3 == 0 && typeof meta[stat.key] != 'undefined'">
            </template>
        <img :src="'data:image/png;base64,' + spell.data.sprite"/>
    </div>`,
})

Vue.mixin({
    data: function () {
        return {
            get Popper() {
                return Popper
            },
            get streamerName() {
                return streamerName
            },
            get wandSprites() {
                return wandSprites
            },
            get spellData() {
                return spellData
            },
            get spellDataMain() {
                return spellDataMain
            },
            get spellDataApoth() {
                return spellDataApoth
            },
            get icons() {
                return icons
            },
            get pillars() {
                return pillars
            },
            get pillarsApoth() {
                return pillarsApoth
            },
            get itemData() {
                return itemData
            },
            get apothIcons() {
                return apothIcons
            },
        }
    },
})

const app = new Vue({
    render: function (h) {
        return h(containerComp)
    },
}).$mount('#app')
