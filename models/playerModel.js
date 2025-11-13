const mongoose = require('mongoose')
const playerSchema = new mongoose.Schema({
    names: [String],
    amounts: [Number],
    shifts: [[String]],
    shiftsTotal: Number,
    shiftsTimer: Number,
    health: [String],
    gold: Number,
    orbs: Number,
    x: Number,
    y: Number,
})

module.exports = mongoose.model('Player Info', playerSchema)
