"""Read the supplied XLSM without executing macros or modifying the source."""
import collections
import datetime
import hashlib
import json
import pathlib
import re
import sys
import openpyxl

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
book = openpyxl.load_workbook(source, read_only=True, data_only=True)
records = []
for sheet_name, header_row in [('RPA 전체 과제 리스트', 1), ('서흥 RPA 리스트', 2)]:
    sheet = book[sheet_name]
    rows = sheet.iter_rows(min_row=header_row, values_only=True)
    headers = [str(v).replace('\n', ' ').strip() if v else '' for v in next(rows)]
    for row_number, row in enumerate(rows, header_row + 1):
        raw = {h: (v.isoformat()[:10] if isinstance(v, (datetime.datetime, datetime.date)) else v.isoformat() if isinstance(v, datetime.time) else v) for h, v in zip(headers, row) if h}
        code = str(raw.get('과제번호') or '').strip()
        if not code or not raw.get('과제명'):
            continue
        pics = list(dict.fromkeys(p.strip() for p in re.split(r'[/,;\n]+', str(raw.get('PIC') or '')) if p.strip()))
        records.append({'id': f'{sheet_name}:{row_number}', 'code': code, 'name': str(raw['과제명']).strip(), 'department': str(raw.get('부서') or ''), 'company': str(raw.get('법인') or ''), 'pics': pics, 'status': str(raw.get('진행 상태') or ''), 'developer': str(raw.get('개발자') or ''), 'sourceSheet': sheet_name, 'sourceRow': row_number, 'fields': raw})
primary = [p for p in records if p['sourceSheet'] == 'RPA 전체 과제 리스트']
for p in records:
    if p['sourceSheet'] != '서흥 RPA 리스트':
        continue
    match = next((x for x in primary if x['code'] == p['code'] and x['name'] == p['name'] and x['pics'] == p['pics']), None)
    if match:
        match.setdefault('additionalSources', []).append(p)
    else:
        primary.append(p)
records = primary
counts = collections.Counter(p['code'] for p in records)
payload = {'sourceFile': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'projects': records, 'duplicateCodes': {k:v for k,v in counts.items() if v > 1}}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'count': len(records), 'sheets': dict(collections.Counter(p['sourceSheet'] for p in records)), 'duplicateCodes': payload['duplicateCodes'], 'missingPic': sum(not p['pics'] for p in records)}, ensure_ascii=False))
