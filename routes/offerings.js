const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const Offering = require("../models/Offering");
const { protect } = require("../middleware/auth");

// GET /api/offering > all
router.get("/", async (req, res) => {
  try {
    const offerings = await Offering.find();
    res.status(200).json({
      success: true,
      count: offerings.length,
      data: offerings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// POST /api/offering
router.post("/", async (req, res) => {
  try {
    const offering = new Offering(req.body);
    const savedOffering = await offering.save();
    res.status(201).json({
      success: true,
      data: savedOffering,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create offering",
      error: error.message,
    });
  }
});

// PUT/api/offering
router.put("/:id", async (req, res) => {
  try {
    const updatedOffering = await Offering.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    if (!updatedOffering) {
      return res.status(404).json({
        success: false,
        message: "Offering not found",
      });
    }

    res.status(200).json({
      success: true,
      data: updatedOffering,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update offering",
      error: error.message,
    });
  }
});

// DELETE/api/offering
router.delete("/:id", async (req, res) => {
  try {
    const deletedOffering = await Offering.findByIdAndDelete(req.params.id);

    if (!deletedOffering) {
      return res.status(404).json({
        success: false,
        message: "Offering not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Offering deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete offering",
      error: error.message,
    });
  }
});

module.exports = router;
