

const mongoose = require("mongoose");

const offerSchemas = mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
});


module.exports=mongoose.model("Offering",offerSchemas)