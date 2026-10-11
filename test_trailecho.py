"""
Unit Test Suite for TrailEcho Bioacoustics Classifier
-----------------------------------------------------
Validates offline acoustic feature extraction, species signature matching,
synthetic field audio generation, and offline journal logging.
"""

import unittest
import os
import json
from trailecho import (
    SPECIES_SIGNATURES,
    AcousticFeatureExtractor,
    TrailClassifier,
    generate_synthetic_chirp,
    save_trail_log
)


class TestTrailEcho(unittest.TestCase):

    def setUp(self):
        self.extractor = AcousticFeatureExtractor(sample_rate=16000)
        self.classifier = TrailClassifier()
        self.test_log = "test_trail_log.json"
        if os.path.exists(self.test_log):
            os.remove(self.test_log)

    def tearDown(self):
        if os.path.exists(self.test_log):
            os.remove(self.test_log)

    def test_silence_handling(self):
        """Ensure silence is correctly filtered and does not trigger false positives."""
        silence = [0.0] * 16000
        res = self.classifier.classify(silence)
        self.assertFalse(res["detected"])
        self.assertIn("Silence", res["reason"])

    def test_species_identification(self):
        """Test accuracy across all defined species profiles."""
        for sp_id, profile in SPECIES_SIGNATURES.items():
            with self.subTest(species=sp_id):
                samples = generate_synthetic_chirp(sp_id, duration_sec=1.5)
                res = self.classifier.classify(samples)
                self.assertTrue(res["detected"], f"Failed to detect {sp_id}")
                self.assertEqual(res["species_id"], sp_id, f"Misclassified {sp_id} as {res.get('species_id')}")
                self.assertGreater(res["confidence"], 0.45, f"Low confidence for {sp_id}")

    def test_feature_extractor_metrics(self):
        """Verify that RMS, ZCR, and centroid are reasonably calculated."""
        samples = generate_synthetic_chirp("black_capped_chickadee", duration_sec=1.0)
        feats = self.extractor.extract_features(samples)
        self.assertGreater(feats["rms"], 0.05)
        self.assertGreater(feats["spectral_centroid"], 2000)
        self.assertGreater(feats["peak_freq"], 3000)

    def test_trail_log_persistence(self):
        """Verify offline trail log JSON serialization."""
        entry = {
            "timestamp": "2026-10-12T01:30:00Z",
            "species": "Wood Thrush",
            "confidence": 0.94,
            "field_note": "Flute-like 'ee-oh-lay' heard in beech grove."
        }
        save_trail_log(self.test_log, entry)
        self.assertTrue(os.path.exists(self.test_log))

        with open(self.test_log, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["species"], "Wood Thrush")


if __name__ == "__main__":
    unittest.main()
