"""Read registration data without modifying the supplied workbook."""
import argparse
import hashlib
import json
from pathlib import Path

import openpyxl

parser = argparse.ArgumentParser()
parser.add_argument('workbook', type=Path)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'assets' / 'registered-players.js')
args = parser.parse_args()
book = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
sheet = book['Registered Player Data']
prices_sheet = book['Player Prices']
prices = {str(prices_sheet.cell(row, 1).value).lower(): prices_sheet.cell(row, 2).value for row in range(4, 9)}
deductions = book['Detailed Rules & Guidelines']
categories = {'All Rounder': 'All Rounder', 'All Rounder/Owner': 'Owner', 'Owner': 'Owner', 'Icon': 'Icon', 'Batter': 'Batsman', 'Bowler': 'Bowler', 'New Player': 'New Player'}
rows = []
for row_number, row in enumerate(sheet.iter_rows(min_row=3, values_only=True), 3):
    number, name, gender, role = row[:4]
    if not name:
        continue
    name = str(name).strip()
    original = {'gender': gender, 'role': role}
    # Explicitly confirmed by the user after inspecting the incomplete row.
    # A later workbook correction takes precedence over this missing-value fallback.
    if name == 'Amit Nagarkoti':
        gender, role = gender or 'Male', role or 'New Player'
    if gender not in ('Male', 'Female') or role not in categories:
        raise ValueError(f'Unresolved gender/category at registration row {row_number}')
    category = categories[role]
    if gender == 'Female' and category not in ('Owner', 'Icon'):
        category = 'Female Player'
    if category == 'Icon':
        base = deductions['C13'].value
    elif category == 'Owner':
        base = deductions['C15' if gender == 'Female' else 'C14'].value
    else:
        price_key = {'All Rounder': 'all-rounder', 'Batsman': 'batsman'}.get(category, category.lower())
        base = prices[price_key]
    rows.append({'number': number, 'name': name, 'gender': gender, 'role': role, 'category': category, 'base': base, 'sourceRow': row_number, **({'confirmedOverride': original} if original != {'gender': gender, 'role': role} else {})})
assert rows, 'The registration sheet contains no player entries.'
assert len({r['name'].casefold() for r in rows}) == len(rows), 'Duplicate player names need review.'
revision = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()[:16]
data = {'revision': revision, 'source': {'file': args.workbook.name, 'sheet': sheet.title, 'range': f"A3:D{rows[-1]['sourceRow']}", 'priceSheet': 'Player Prices'}, 'players': rows}
output = args.output
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text('// Imported from the supplied workbook. Amit details were confirmed by the user.\nconst REGISTERED_PLAYER_DATA = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n', encoding='utf-8')
print(f'Imported {len(rows)} registered players into {output.name}; revision {revision}.')
