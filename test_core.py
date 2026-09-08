import copy
import io
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from storage import Store, Conflict, totals
from nutrition_assistant import NutritionAssistant, AssistantError, parse_response

SEED = Path(__file__).parent / 'seed.public.json'


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(self.temp.name, SEED)

    def test_meal_calculation_persistence_and_snapshot(self):
        snapshot = self.store.read()
        state = snapshot['state']
        food = copy.deepcopy(next(f for f in state['foods'] if f['id'] == 'peanut'))
        state['days']['2026-09-08'] = {'complete': False, 'entries': [{'id': 'entry-1', 'food': food, 'quantity': 30, 'meal': 'Café da manhã'}]}
        self.assertEqual(totals(state['days']['2026-09-08'])['kcal'], 165)
        self.assertEqual(totals(state['days']['2026-09-08'])['protein'], 6)
        next(f for f in state['foods'] if f['id'] == 'peanut')['kcal'] = 100
        self.store.save(state, snapshot['revision'])
        reopened = Store(self.temp.name, SEED).read()
        self.assertEqual(totals(reopened['state']['days']['2026-09-08'])['kcal'], 165)
        with self.assertRaises(Conflict):
            self.store.save(state, snapshot['revision'])

    def test_backup_restore_and_invalid_input_preserve_data(self):
        backup = self.store.backup()
        initial = json.loads(backup.read_text(encoding='utf-8'))
        changed = copy.deepcopy(initial)
        changed['targets'].append({'date': '2026-09-09', 'kcal': 2800, 'protein': 140})
        self.store.save(changed, 0)
        self.store.save(initial, 1, restore=True)
        self.assertEqual(self.store.read()['state'], initial)
        previous = list((Path(self.temp.name) / 'backups').glob('antes-restauracao*.json'))
        self.assertEqual(json.loads(previous[0].read_text(encoding='utf-8')), changed)
        invalid = copy.deepcopy(initial)
        invalid['foods'][0]['kcal'] = float('nan')
        with self.assertRaises(ValueError):
            self.store.save(invalid, 2, restore=True)
        self.assertEqual(self.store.read()['state'], initial)

    def test_recipe_portion_and_unknown_protein(self):
        state = self.store.read()['state']
        recipe = {'servings': 2, 'items': [{'foodId': 'peanut', 'quantity': 30}]}
        foods = {f['id']: f for f in state['foods']}
        entries = [{'food': foods[i['foodId']], 'quantity': i['quantity']/2} for i in recipe['items']]
        total = totals({'entries': entries})
        self.assertAlmostEqual(total['kcal'], 82.5)
        entries[0]['food']['protein'] = None
        self.assertTrue(totals({'entries': entries})['unknownProtein'])

    def test_assistant_labels_unverified_estimates_and_rejects_invalid_values(self):
        item = {'status': 'estimate', 'name': 'Alimento de teste', 'base': 150, 'unit': 'g',
                'kcal': 180, 'protein': 4, 'note': '', 'question': '', 'source_url': 'https://example.org/food'}
        response = {'status': 'completed', 'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': json.dumps(item)}]}]}
        parsed = parse_response(response)
        self.assertEqual(parsed['kcal'], 180)
        self.assertEqual(parsed['sources'], [])
        self.assertIn('sem fonte verificada', parsed['sourceLabel'])
        item['kcal'] = float('nan')
        response['steps'][0]['content'][0]['text'] = json.dumps(item)
        with self.assertRaises(AssistantError):
            parse_response(response)
        clarification = {'status': 'clarify', 'question': 'O peso é cru ou cozido?'}
        response['steps'][0]['content'][0]['text'] = json.dumps(clarification)
        self.assertEqual(parse_response(response)['question'], clarification['question'])

    def test_assistant_encrypted_key_payload_and_session_cache(self):
        assistant = NutritionAssistant(self.temp.name)
        with self.assertRaises(AssistantError):
            assistant.estimate('150 g de alimento de teste')
        fake_key = 'AQ.' + 'test-only-not-a-real-key-' * 30
        for invalid in ('', 'short', 'AQ.' + 'x' * 20 + '\nheader', 'x' * 4097):
            with self.assertRaises(AssistantError):
                assistant.configure(invalid)
        assistant.configure(fake_key)
        self.assertNotIn(fake_key.encode(), assistant.path.read_bytes())
        item = {'status': 'estimate', 'name': 'Alimento de teste', 'base': 150, 'unit': 'g',
                'kcal': 180, 'protein': None, 'note': '', 'question': '', 'source_url': 'https://example.org/food'}
        response = {'status': 'completed', 'steps': [{'type': 'model_output', 'content': [{'type': 'text', 'text': json.dumps(item)}]}]}
        with patch('nutrition_assistant.urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as call:
            result = assistant.estimate('150 g de alimento de teste')
            self.assertEqual(assistant.estimate('150 g de alimento de teste'), result)
            self.assertEqual(call.call_count, 1)
            payload = json.loads(call.call_args.args[0].data)
            self.assertEqual(payload['input'], '150 g de alimento de teste')
            self.assertFalse(payload['store'])
            self.assertNotIn('days', payload)
            self.assertNotIn('tools', payload)
            self.assertIn('generativelanguage.googleapis.com', call.call_args.args[0].full_url)
        backup = self.store.backup().read_text(encoding='utf-8')
        self.assertNotIn(fake_key, backup)
        assistant.remove_key()
        self.assertFalse(assistant.status()['configured'])


if __name__ == '__main__':
    unittest.main()
