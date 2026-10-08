import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from scripts import collect_candidates as candidates, collect_trends as trends


class CollectorTests(unittest.TestCase):
    def product(self, previous=None, now='2026-10-08T01:00:00+00:00'):
        return candidates.normalize_product(candidates.SOURCES[0], {
            'code': '123456789', 'product_name': 'Silver bracelet',
            'brands': 'Test', 'countries_tags': ['en:malaysia'],
            'categories_tags': ['en:bracelets'], 'image_front_url': 'https://example.com/image'
        }, previous or {}, now)

    def test_factual_score(self):
        p = self.product()
        self.assertEqual(p['category'], 'Jewelry & Accessories')
        self.assertEqual(p['market_tags'], ['MY'])
        self.assertEqual(p['research_priority_score'], 100)
        for field in ('price', 'sales', 'gmv', 'trend_growth'):
            self.assertIsNone(p[field])

    def test_same_day_not_extra_observation(self):
        p = self.product()
        again = self.product({p['id']: p})
        self.assertEqual(again['days_observed'], 1)
        next_day = self.product({p['id']: p}, '2026-10-09T01:00:00+00:00')
        self.assertEqual(next_day['days_observed'], 2)

    def test_unknown_market_not_invented(self):
        p = candidates.normalize_product(candidates.SOURCES[0], {
            'code': '123456789', 'product_name': 'Ring', 'countries_tags': ['en:france']
        }, {}, '2026-10-08')
        self.assertEqual(p['market_tags'], [])

    def test_invalid_record(self):
        self.assertIsNone(candidates.normalize_product(candidates.SOURCES[0], {}, {}, '2026-10-08'))

    def test_partial_trends_preserve_old_market(self):
        old = {'market': 'MY', 'keyword': 'old', 'observed_at': '2026-10-07', 'approx_search_traffic': '100+'}
        with patch.object(trends, 'fetch_market', side_effect=[[{'market': 'US', 'keyword': 'new'}], RuntimeError('offline')]):
            result = trends.collect({'items': [old]}, '2026-10-08')
        self.assertEqual(result['items'][1]['freshness'], 'stale')
        self.assertEqual(result['items'][1]['observed_at'], '2026-10-07')
        self.assertEqual(result['sources'][1]['status'], 'error')

    def test_all_failed_preserves_output(self):
        with patch.object(trends, 'fetch_market', side_effect=RuntimeError('offline')):
            with self.assertRaises(RuntimeError):
                trends.collect({}, '2026-10-08')

    def test_partial_catalog_retains_failed_source(self):
        old = self.product()
        old['source_collection'] = 'opf_jewelry'
        other = {'code': '987654321', 'product_name': 'Shampoo'}
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'products.json'
            output.write_text(json.dumps({'products': [old]}))
            with patch.object(candidates, 'OUTPUT', output), patch.object(candidates.time, 'sleep'), patch.object(candidates, 'fetch_source', side_effect=[RuntimeError('offline'), [], [other], [], []]):
                candidates.main()
            result = json.loads(output.read_text())
        retained = next(p for p in result['products'] if p['id'] == old['id'])
        self.assertEqual(retained['freshness'], 'stale')
        self.assertEqual(retained['last_seen_at'], old['last_seen_at'])

    def test_retry_recovers(self):
        with patch.object(trends, 'fetch_market_once', side_effect=[OSError('timeout'), [{'keyword': 'real'}]]), patch.object(trends.time, 'sleep'):
            self.assertEqual(trends.fetch_market('MY')[0]['keyword'], 'real')


if __name__ == '__main__':
    unittest.main()
