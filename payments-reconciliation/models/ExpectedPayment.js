  const mongoose = require("mongoose");

  const expectedSchema = new mongoose.Schema({

    source_type: {
    type: String,
    default: "invoice"
    },


    source_ref: {
      type: String,
      required: true
    },

    customer_id: {
      type: String,
      required: true
    },

    amount: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      required: true
    },

    due_date: {
      type: Date,
      required: true
    },

    status: {
      type: String,
      default: "PENDING"
    },

    import_hash: String,

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }

  }, { timestamps: true });

  module.exports = mongoose.model("ExpectedPayment", expectedSchema);
