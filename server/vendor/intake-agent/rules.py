# -*- coding: utf-8 -*-
"""
요구 수집 및 타당성 평가 Agent (2026-008) — 규칙 엔진.

이 파일은 **프레임워크 무관 순수 파이썬**이다. Flask·요청 객체·전역 상태를 쓰지 않는다.
나중에 플랫폼에 임베딩할 때 이 파일이 그대로 코어가 된다. (app.py 는 얇은 어댑터)

담당 FR (ARD 5번)
  FR-03  정량 수치 되묻기 (비정량 감지)  → is_vague_quantity() / parse_quantity()
  FR-04  INT 문서 생성                   → INT_SPEC / render_doc() / validate_doc()
  FR-07  간이 ROI 계산                   → calc_roi()
  FR-08  트랙·유형 판정                  → judge_track() / judge_type()
  FR-09  판정 근거 인용                  → CITE
  FR-10  FEA 문서 생성                   → FEA_SPEC / render_doc()
  FR-11  민감정보 차단                   → scan_sensitive() / mask_sensitive()
  금칙   G-1 ~ G-7                       → check_guardrails()

근거: Agent_개발_표준체계.md (v3.1) — 0.3절(트랙) / 0.4절(유형) / 문서①(INT)·②(FEA) 양식.
문서 양식과 판정 기준은 **표준체계 파일이 원본**이며, 아래 상수는 그 사본이다.
표준체계가 개정되면 load_standard() 가 해시 변경을 감지해 회귀 평가를 요구한다(ARD 6.3).
"""
from __future__ import annotations

import hashlib
import re
from datetime import date

# 이 규칙 엔진이 사본으로 담고 있는 표준체계 버전. load_standard() 결과와 대조한다.
STANDARD_VERSION = "v4.0"
STANDARD_DATE = "2026-09-08"

# ────────────────────────────────────────────────────────────────────────────
# 1. 표준체계 조항 인용 (FR-09)
#    판정마다 여기의 문자열을 붙인다. 인용 없는 판정은 금칙 G-4 위반이다.
# ────────────────────────────────────────────────────────────────────────────
CITE = {
    "track.base": "표준체계 0.3절 「트랙 분류」 정의표",
    "track.write": "표준체계 0.3절 판정 기준 — “시스템에 쓰기·실행 권한을 갖는가? → 상”",
    "track.sensitive": "표준체계 0.3절 판정 기준 — “민감 개인정보(주민번호·건강·급여·인사평가)를 다루는가? → 상”",
    "track.scope": "표준체계 0.3절 판정 기준 — “사용자가 3개 부서 이상인가? → 중 이상”",
    "track.damage": "표준체계 0.3절 판정 기준 — “오답이 금전적 손실·법적 문제로 이어지는가? → 상”",
    "track.autonomy": "표준체계 0.3절 판정 기준 — “자율성 L2 이상인가? → 상”",
    "track.identifying": "표준체계 0.3절 판정 기준 — “업무 식별정보(사번·성명·소속·일정)를 다루는가? → 중 이상”",
    "track.autonomy_table": "표준체계 0.3절 「자율성과 트랙」 표 — 「최소 트랙」 열",
    "track.docs": "표준체계 0.3절 트랙별 필수 문서",
    "type.question": "표준체계 0.4절 유형 판정 질문 — “어딘가에 해석·판단·생성이 필요한가?”",
    "type.hybrid": "표준체계 0.4절 — “혼합형은 규칙 흐름 중 일부만 LLM을 쓰는 경우다”",
    "type.quality": "표준체계 0.4절 「품질 확인」 — 판단형=평가셋 정답률 N% 이상 / 규칙형=테스트 케이스 100% 통과",
    "int.form": "표준체계 문서① 에이전트 요구 접수서(INT) 양식 1~5번 (분량 1페이지)",
    "int.quantity": "표준체계 문서① — “2번의 숫자는 타당성 판단의 근거가 되므로 대략이라도 받는다. 정확한 측정을 요구하지는 않는다”",
    "int.problem": "표준체계 문서① 작성 안내 — “여기서는 해결책이 아니라 고통을 묻는다”",
    "int.required": "표준체계 문서① — 구두 요청은 접수로 치지 않는다. “문서 없으면 요구 없음”",
    "fea.form": "표준체계 문서② 타당성 평가서(FEA) 양식 1~6번 (분량 1페이지)",
    "fea.alt": "표준체계 문서② 양식 2번 — “프로세스·규정 개선 → 기존 시스템 기능 → 매크로·엑셀 → 단순 LLM 챗 ▶ 값싼 해법부터 배제한 기록. 왜 굳이 에이전트인가?”",
    # 원문은 "이 문서의 존재 이유는…" 인데, 인용만 떼어 화면에 실으면 "이 문서" 가 방금 만든 평가서를
    # 가리키는 것처럼 읽힌다. 지시 대상을 풀어서 적는다.
    "fea.purpose": "표준체계 문서② 작성 안내 — 타당성 평가서(FEA)의 존재 이유는 “만들지 않을 용기”",
    "fea.roi": "표준체계 문서② 양식 3번 「기대 효과」 — “대략의 절감 효과. 정밀한 수치나 금액 환산은 요구하지 않는다”",
    "fea.drop": "표준체계 문서② — “Drop도 성과다. Drop 기록은 별도 표에 쌓아 분기별로 집계한다”",
    "fea.rule_doc": "표준체계 문서② — “규칙(로직) 문서화가 어려우면 조건부 Go를 검토한다”",
    "ard.form": "표준체계 문서③ 에이전트 요구사항 정의서(ARD) 양식 1~7번 (분량 A4 3장)",
    "ard.required": "표준체계 문서③ — “자율성 수준과 Out of Scope가 필수라는 것이다. 둘이 없는 ARD는 반려한다”",
    "ard.no_metric": "표준체계 문서③ — “평가 기준과 실패 분석은 AI가 EVD 단계에서 수행하므로 여기서 수치를 요구하지 않는다”",
    "ard.oneline": "표준체계 문서③ 양식 1번 — “이 에이전트는 [사용자]가 [업무]를 할 때 [무엇]을 [어디까지] 해준다”",
    "ard.oneline_note": "표준체계 문서③ — “1번 빈칸을 못 채우면 요구가 아직 덜 정리된 것이다. 특히 \"어디까지\"가 자율성과 직결된다”",
    "ard.scope": "표준체계 문서③ 양식 2번 — “Out of Scope: 하지 않는 일 (명시적으로!)” · 서두 원칙 ④ “Out of Scope는 In Scope만큼 공들여 쓴다”",
    "ard.human": "표준체계 문서③ 양식 2번 — “사람 개입 지점: 어디서 사람이 확인·승인하는가”",
    "ard.fr": "표준체계 문서③ 양식 4번 — “FR-01 [기능명] 입력 → 행동 → 출력 [M/S/C]”, “3요소가 빠진 FR은 반려”",
    "ard.knowledge": "표준체계 문서③ — “지식 갱신은 현업 이관이 원칙이다. 갱신 프로세스 없는 에이전트는 개정 전 규정을 계속 답한다”",
    "ard.security": "표준체계 문서③ 양식 6번 「보안·제약」 — “데이터 분류, 승인된 플랫폼, 로그 범위, 일정·조직 제약”",
    "ard.revision": "표준체계 0.6절 — “ARD가 바뀌면 재심사다”. 경로는 ARD 개정 → G2 재승인 → 재평가 → G3 재승인",
    "gate.gf": "표준체계 0.6절 게이트 명세표 GF 긴급 착수 — 근거 ARD-Lite, “외부 기한 존재 + 팀장 자격 판정 (0.7절)”, 팀장 단독",
    "gate.g1": "표준체계 0.6절 게이트 명세표 G1 착수 — 근거 FEA, “Go 판정 + 트랙·유형 확정 + 대안 검토 기록”, 승인 주체 팀장",
    "gate.g2": "표준체계 0.6절 게이트 명세표 G2 개발 착수 — 근거 ARD, “한 줄 정의 / 범위 선언 / 자율성 수준 3종 기재”, 요구자+오너+팀장 3자",
    "gate.g3": "표준체계 0.6절 게이트 명세표 G3 배포 — 근거 EVD, “AI 평가 보고서 제출 + 배포 가능 판정 + 요구자 UAT 완료”",
    "num": "표준체계 0.2절 문서 번호 체계 — {연도}-{일련번호}-{문서코드}",
    "roles": "표준체계 0.5절 「역할」 — 요구자 / 오너(현업 부서장) / 개발 담당(AI 활성화팀) / 승인자(팀장)",
    # v4.0 서두 — 되묻기 강도의 근거. 최소 수집이 기준이지 최대 수집이 아니다.
    "doc.length": "표준체계 서두 「분량 상한」 (DES 제외 A4 3장) — “권고가 아니라 상한이다. 넘긴 문서는 반려한다”",
    "doc.readable": "표준체계 서두 원칙 ③ 「판단할 재료를 준다」 — “판단할 재료가 없으면 서명은 형식이 된다”",
    "hitl": "표준체계 문서⑤ AI 평가 운영 원칙 — “AI 평가와 요구자 UAT는 짝이다”, “UAT가 사람이 실물을 확인하는 유일한 지점이다”",
}

# ────────────────────────────────────────────────────────────────────────────
# 2. 표준체계 파일 로더 — 최신성 확인 (ARD 6.3 / FR-12)
# ────────────────────────────────────────────────────────────────────────────
# 머리말이 마크다운 굵게(**최종 수정**:)로 적혀 있으므로 * 를 건너뛴다.
_RE_STD_META = re.compile(
    r"최종\s*수정\s*[*\s]*[:：]\s*(?P<date>\d{4}-\d{2}-\d{2})"
    r".*?상태\s*[*\s]*[:：]\s*[^(]*\((?P<ver>v[\d.]+)\)",
    re.S,
)


# 이 앱이 실제로 인용하는 개념들. 하나라도 없으면 표준체계 문서가 아니거나 구조가 바뀐 것이다.
# 버전 문자열("v3.1")만 보면 ARD 같은 다른 문서도 통과해 버린다 — 내용으로 확인한다.
#
# ⚠️ 마커는 **개정에 견디는 문구**로 고른다. v1.0 → v3.1 에서 "트랙 판정 기준"→"판정 기준",
#    "업무지원 Agent"→"규칙형" 으로 표현이 바뀌면서 마커가 깨져 v3.1 이 거부당했다.
#    절 번호나 부제목처럼 개정 때 손대는 표현이 아니라, 체계의 **용어 자체**를 쓴다.
#    마커 후보는 두 조건을 함께 만족해야 한다:
#      ① 개정에 잘 안 바뀔 것 → 절 번호·부제목이 아니라 체계의 **원칙 문장**을 쓴다
#      ② 다른 문서와 겹치지 않을 것 → "트랙 분류"·"혼합형" 같은 일반 용어를 쓰면
#         표준체계를 설명하는 ARD·DES 까지 표준체계로 통과해 버린다 (실제로 그랬다)
STANDARD_MARKERS = [
    ("principle", "평가 없이 배포 없다", "체계 원칙 ① (문서 정체성)"),
    ("track", "최소 트랙", "0.3절 자율성 ↔ 트랙 대응표"),
    ("int", "문서 없으면 요구 없음", "문서① 요구 접수서(INT) 원칙"),
    ("fea", "값싼 해법부터", "문서② 타당성 평가서(FEA) 대안 검토 원칙"),
]


def load_standard(path) -> dict:
    """표준체계 원문을 읽어 버전·기준일·해시를 뽑고, 표준체계 문서가 맞는지 확인한다.

    사용할 때마다 최신성을 확인해야 하므로(요구자 지시), 앱은 매 기동 시 이 함수를 호출하고
    반환된 sha256 을 직전 값과 비교한다. 달라졌으면 회귀 평가 대상이다.
    """
    out = {
        "found": False, "path": str(path), "version": None, "date": None,
        "sha256": None, "bytes": 0, "matches_engine": False, "note": "",
        "missing_sections": [], "looks_like_standard": False,
    }
    try:
        raw = open(path, "rb").read()
    except Exception as e:
        out["note"] = f"표준체계 파일을 읽을 수 없습니다: {e}"
        return out

    out["found"] = True
    out["bytes"] = len(raw)
    out["sha256"] = hashlib.sha256(raw).hexdigest()
    text = raw.decode("utf-8", errors="replace")

    m = _RE_STD_META.search(text[:4000])
    if m:
        out["date"] = m.group("date")
        out["version"] = m.group("ver")
    else:
        # 헤더 형식이 바뀐 경우 — 버전만이라도 본문에서 찾는다.
        m2 = re.search(r"\bv(\d+\.\d+)\b", text[:2000])
        out["version"] = f"v{m2.group(1)}" if m2 else None
        out["note"] = "머리말에서 최종 수정일을 찾지 못했습니다. 문서 형식이 바뀌었는지 확인하세요."

    # 표준체계 문서가 맞는지 — 이 앱이 인용하는 절이 실제로 들어 있는가
    out["missing_sections"] = [label for _k, marker, label in STANDARD_MARKERS if marker not in text]
    out["looks_like_standard"] = not out["missing_sections"]

    out["matches_engine"] = (out["version"] == STANDARD_VERSION)
    if not out["looks_like_standard"]:
        out["note"] = ("표준체계 문서로 보이지 않습니다. 다음이 없습니다 — "
                       + ", ".join(out["missing_sections"]))
    elif not out["matches_engine"]:
        out["note"] = (f"규칙 엔진이 담고 있는 기준({STANDARD_VERSION})과 "
                       f"표준체계 파일({out['version']})이 다릅니다. "
                       "판정 기준표를 대조하고 평가셋 전체를 재실행하세요.")
    return out


# ────────────────────────────────────────────────────────────────────────────
# 3. 정량 수치 파싱 (FR-03 / FR-07)
#    추정치를 만들어 채우지 않는다. 못 읽으면 못 읽었다고 말한다.
# ────────────────────────────────────────────────────────────────────────────
VAGUE_WORDS = [
    "자주", "많이", "종종", "가끔", "꽤", "여러", "수시로", "빈번", "이따금",
    "적당히", "대충", "그때그때", "상당히", "좀", "조금", "많음", "적음",
    "반나절", "한나절", "온종일", "하루종일", "금방", "오래",
    # 알맹이 없는 상투 문장 — narrative 에서 **짧을 때만** 걸린다 (min×2 미만)
    "업무가 많", "일이 많", "비효율적", "효율화 필요", "개선이 필요",
]

_RE_RANGE = re.compile(r"\d+\s*(?:~|-|—|부터|에서)\s*\d+")
_RE_NUM = re.compile(r"(\d+(?:\.\d+)?)")

# 시간 단위 → 분
_TIME_UNITS = [
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:시간|hr|hour|h)\b", re.I), 60.0),
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:분|min|m)\b", re.I), 1.0),
    (re.compile(r"(\d+(?:\.\d+)?)\s*(?:일|day|d)\b", re.I), 480.0),  # 1일 = 8h
]


def is_vague_quantity(text: str) -> bool:
    """“자주”, “많이”, “반나절” 같은 비정량 답변인가. (FR-03 되묻기 트리거)"""
    if not text:
        return True
    t = str(text).strip()
    if not t:
        return True
    if any(w in t for w in VAGUE_WORDS):
        return True
    return not _RE_NUM.search(t)


def parse_quantity(text, kind: str = "count") -> dict:
    """자유 입력에서 단일 수치를 뽑는다.

    kind = "count"  → 건수 (그대로)
    kind = "minutes"→ 시간 (분으로 환산)
    kind = "people" → 인원

    반환: {ok, value, unit, raw, reason}
      ok=False 면 **계산을 진행하면 안 된다** (금칙 G-3).
    """
    raw = "" if text is None else str(text).strip()
    r = {"ok": False, "value": None, "unit": "", "raw": raw, "reason": "",
         "approx": False, "approx_note": ""}

    if not raw:
        r["reason"] = "값이 비어 있습니다."
        return r

    hit = [w for w in VAGUE_WORDS if w in raw]
    if hit:
        r["reason"] = f"비정량 표현(“{hit[0]}”)이라 계산에 쓸 수 없습니다. 구체적인 숫자가 필요합니다."
        return r

    # v4.0: "대략의 숫자로", "정확한 측정을 요구하지는 않는다".
    # 범위는 되묻지 않고 **중간값**으로 받되 approx 로 표시해 문서에 "약" 을 붙인다.
    m = _RE_RANGE.search(raw)
    if m:
        lo, hi = (float(x) for x in _RE_NUM.findall(m.group(0))[:2])
        mid = (lo + hi) / 2
        rest = (raw[:m.start()] + raw[m.end():]).strip()
        raw = f"{mid:g}{rest}"
        r["approx"] = True
        r["approx_note"] = f"범위 {m.group(0)} 의 중간값 {mid:g} 을 대표값으로 씁니다."

    if kind == "minutes":
        total = 0.0
        found = False
        for rx, mul in _TIME_UNITS:
            for m in rx.finditer(raw):
                total += float(m.group(1)) * mul
                found = True
        if not found:
            nums = _RE_NUM.findall(raw)
            if len(nums) == 1:
                r["reason"] = "단위가 없습니다. “30분”, “1.5시간”처럼 단위를 붙여 주세요."
                return r
            r["reason"] = "시간을 읽을 수 없습니다. “30분”, “1.5시간” 형태로 입력해 주세요."
            return r
        r.update(ok=True, value=round(total, 2), unit="분")
        return r

    nums = _RE_NUM.findall(raw)
    if not nums:
        r["reason"] = "숫자를 찾지 못했습니다."
        return r
    if len(nums) > 1:
        # 되묻지 않는다. 첫 숫자를 쓰고 근사임을 밝힌다 (v4.0 최소 수집 기조).
        r["approx"] = True
        r["approx_note"] = f"숫자가 여러 개라 첫 값({nums[0]})을 대표값으로 씁니다."

    v = float(nums[0])
    if v <= 0:
        r["reason"] = "0 이하의 값은 계산에 쓸 수 없습니다."
        return r
    r.update(ok=True, value=v, unit={"count": "건", "people": "명"}.get(kind, ""))
    return r


# ────────────────────────────────────────────────────────────────────────────
# 3-b. 슬롯 품질 판정 (FR-01 / FR-03)
#      "값이 채워졌는가" 가 아니라 **"INT 를 쓸 수 있는 수준인가"** 를 본다.
#      담당자가 인터뷰에서 하던 판단을 규칙으로 1차 대신한다. 최종 판단은 LLM 이 함께 한다.
#      grade: missing(비어 있음) / weak(수준 미달 — 계속 물어야 함) / ok
# ────────────────────────────────────────────────────────────────────────────
# 현업이 문제 대신 해결책을 말할 때 나오는 말들 (표준체계 문서① 작성 안내)
SOLUTION_WORDS = [
    "챗봇", "봇을 만들", "봇 만들", "자동화 시스템", "시스템을 만들", "시스템 만들",
    "프로그램을 만들", "프로그램 만들", "앱을 만들", "앱 만들", "AI를 만들", "AI 만들",
    "에이전트를 만들", "에이전트 만들", "솔루션 도입", "툴 도입", "RPA", "매크로 만들",
    "자동으로 해주는", "자동화해주", "자동화 해주",
]

# 알맹이 없이 길이만 채우는 상투어
FILLER_WORDS = ["기타", "등등", "여러가지", "여러 가지", "그런 것", "이것저것", "해당없음",
                "없음", "모름", "잘 모르", "미정", "추후", "나중에", "-", "."]

# v4.0 기조 — **최소한을 묻는다.** 판단 기준은 "이 문서만 읽고 무슨 일인지 알 수 있는가" 하나다.
# 길이는 그 판단의 하한선일 뿐, 목표가 아니다. 부족한 부분은 담당자가 검토에서 잡는다(Human-in-the-loop).
SLOT_RULES = {
    "requester_name":  {"kind": "short", "label": "요구자", "min": 2},
    "requester_dept":  {"kind": "short", "label": "부서", "min": 2},
    "requester_contact": {"kind": "short", "label": "연락처", "min": 2, "optional": True},
    "problem":     {"kind": "narrative", "label": "문제 서술", "min": 12, "no_solution": True},
    "who":         {"kind": "short", "label": "누가", "min": 2},
    # v4.0: 대략의 숫자면 충분하다. 못 받으면 미확보로 두고 넘어간다 — 판정을 깎지 않는다.
    "frequency":   {"kind": "quant_count", "label": "얼마나 자주", "optional": True},
    "minutes":     {"kind": "quant_minutes", "label": "몇 분씩", "optional": True},
    "people":      {"kind": "quant_people", "label": "인원", "optional": True},
    "pain_point":  {"kind": "narrative", "label": "가장 번거롭거나 실수 잦은 부분", "min": 8},
    "as_is":       {"kind": "narrative", "label": "현재 처리 방식", "min": 8},
    "systems":     {"kind": "short", "label": "사용 시스템·파일", "min": 2},
    "refs":        {"kind": "short", "label": "참고 규정·문서", "min": 2, "optional": True},
    # v3.1 INT 양식에는 To-Be 항목이 없다 (해결책이 아니라 고통을 묻는다).
    # 옛 접수 건에 값이 남아 있을 수 있어 등급 기준만 남기고 선택으로 둔다.
    "to_be":       {"kind": "narrative", "label": "기대 모습 (구 v1.0 항목)", "min": 15,
                    "optional": True},
    "risk":        {"kind": "narrative", "label": "잘못 처리되면 생기는 일", "min": 8},
    "when":        {"kind": "short", "label": "희망 시점", "min": 2},
    "why_urgent":  {"kind": "short", "label": "긴급 사유", "min": 4, "optional": True},
}


def _hit_words(text: str, words) -> str:
    for w in words:
        if w in text:
            return w
    return ""


def assess_slot(key: str, value, ruleset: dict | None = None) -> dict:
    """슬롯 하나가 문서를 쓸 수 있는 수준인지 본다.

    ruleset 을 주면 그 기준으로 본다 (INT=SLOT_RULES, FEA=FEA_SLOT_RULES).
    반환: {grade, reason, ask(다시 물을 때 쓸 힌트), optional}
    """
    spec = (ruleset if ruleset is not None else SLOT_RULES).get(key) \
        or {"kind": "short", "label": key, "min": 1}
    label = spec.get("label", key)
    opt = bool(spec.get("optional"))
    v = "" if value is None else str(value).strip()
    out = {"grade": "ok", "reason": "", "ask": "", "optional": opt, "label": label}

    if not v:
        out.update(grade="missing", reason="아직 받지 못했습니다.")
        return out

    kind = spec["kind"]

    if kind == "grade":
        if v not in ("상", "중", "하"):
            out.update(grade="weak", reason=f"“{v}” 는 등급이 아닙니다.",
                       ask="상 / 중 / 하 중 하나로 판정해 주세요.")
        return out

    if kind.startswith("quant_"):
        q = parse_quantity(v, kind.split("_", 1)[1])
        if not q["ok"]:
            out.update(grade="weak", reason=q["reason"],
                       ask="대략의 숫자면 됩니다 (범위로 답하셔도 좋습니다). "
                           "정확한 측정을 요구하는 것이 아닙니다.")
        return out

    # 상투어만 있으면 답이 아니다
    if v.strip(" .-") in FILLER_WORDS or v in FILLER_WORDS:
        out.update(grade="weak", reason=f"“{v}” 는 답으로 볼 수 없습니다.",
                   ask="한 문장이라도 실제 내용을 적어 주세요.")
        return out

    if kind == "narrative":
        if spec.get("no_solution"):
            w = _hit_words(v, SOLUTION_WORDS)
            if w:
                out.update(grade="weak",
                           reason=f"해결책(“{w}”)이 섞여 있습니다. 여기서는 문제를 적어야 합니다.",
                           ask="표준체계 문서①: “여기서는 해결책이 아니라 고통을 묻는다.”")
                return out
        # 판단 기준은 길이가 아니라 **이 문장만 읽고 무슨 일인지 알 수 있는가** 다.
        if len(v) < spec.get("min", 10):
            out.update(grade="weak",
                       reason=f"{len(v)}자뿐이라 이 항목만 읽고는 무슨 일인지 알 수 없습니다.",
                       ask="한 문장이면 됩니다. 무엇이 문제인지만 알려 주세요.")
            return out
        w = _hit_words(v, VAGUE_WORDS)
        if w and len(v) < spec.get("min", 10) * 2:
            out.update(grade="weak",
                       reason=f"“{w}” 뿐이라 읽는 사람이 상황을 그릴 수 없습니다.",
                       ask="상황 하나만 예로 들어 주세요.")
            return out
        return out

    # short
    if len(v) < spec.get("min", 2):
        out.update(grade="weak", reason=f"{len(v)}자로 너무 짧습니다.", ask="조금 더 구체적으로 적어 주세요.")
    return out


def assess_form(data: dict, ruleset: dict) -> dict:
    """양식 전체 진단. 어디까지 왔고 무엇을 더 물어야 하는지.

    ready=True 면 문서를 만들 수준이다. (필수 항목이 전부 ok)
    """
    slots, missing, weak, ok, soft = {}, [], [], [], []
    for key in ruleset:
        a = assess_slot(key, (data or {}).get(key), ruleset)
        slots[key] = a
        # v4.0 — 선택 항목은 비어 있든 부실하든 **진행을 막지 않는다.**
        # 부실하면 화면에는 표시하되(soft), ready 판정에서는 세지 않는다.
        if a["optional"]:
            if a["grade"] == "weak":
                soft.append(key)
                weak.append(key)
            elif a["grade"] == "ok":
                ok.append(key)
            continue
        if a["grade"] == "missing":
            missing.append(key)
        elif a["grade"] == "weak":
            weak.append(key)
        else:
            ok.append(key)

    required = [k for k, s in ruleset.items() if not s.get("optional")]
    done = sum(1 for k in required if slots[k]["grade"] == "ok")
    blocking = [k for k in weak if k not in soft]
    return {
        "slots": slots, "missing": missing, "weak": weak, "ok": ok, "soft": soft,
        "required_total": len(required), "required_ok": done,
        "percent": round(done * 100 / len(required)) if required else 0,
        # 필수 항목이 전부 이해 가능한 수준이면 진행한다. 선택 항목은 붙잡지 않는다.
        "ready": not missing and not blocking,
        "next": (missing + weak)[0] if (missing or weak) else "",
    }


def assess_int(data: dict) -> dict:
    return assess_form(data, SLOT_RULES)


def assess_fea(form: dict) -> dict:
    return assess_form(form, FEA_SLOT_RULES)


# ── FEA 슬롯 품질 기준 (FR-05/06/10) ──────────────────────────────────────
# 표준체계 문서② 양식의 서술 항목들. 트랙·유형·ROI 는 규칙이 계산하므로 여기 없다.
FEA_SLOT_RULES = {
    "summary": {"kind": "narrative", "label": "요구 요약", "min": 15},

    # 2번 대안 검토 — 값싼 해법부터 배제한 '기록' 이어야 한다. 한 줄로 뭉개면 안 된다.
    "alt_process": {"kind": "narrative", "label": "대안 ① 프로세스/규정 개선", "min": 10},
    "alt_system": {"kind": "narrative", "label": "대안 ② 기존 시스템 기능/설정", "min": 10},
    "alt_macro": {"kind": "narrative", "label": "대안 ③ 매크로/엑셀", "min": 10},
    "alt_llm": {"kind": "narrative", "label": "대안 ④ 단순 LLM 챗", "min": 10},
    "alt_conclusion": {"kind": "narrative", "label": "대안 검토 결론", "min": 12},

    # 5번 조건부 Go 신호 — v4.0 문서② "규칙(로직) 문서화가 어려우면 조건부 Go를 검토한다"
    "fit_rule_doc_grade": {"kind": "grade", "label": "판단 규칙을 문서로 적을 수 있는가 (등급)"},
    "fit_rule_doc_reason": {"kind": "narrative", "label": "그렇게 본 근거", "min": 10,
                            "optional": True},

    # 3번 기대 효과 — v4.0: "대략의 절감 효과. 정밀한 수치나 금액 환산은 요구하지 않는다"
    "roi_saving": {"kind": "short", "label": "대략의 절감 효과", "min": 4, "optional": True},

    # 4번 트랙·유형 판정 — 판정은 규칙이 하고, 오답 최대 피해는 사람이 서술한다
    "damage_desc": {"kind": "narrative", "label": "오답 최대 피해", "min": 8},

    # 6번 승인
    "written_by": {"kind": "short", "label": "작성자", "min": 2},
    "reviewed_by": {"kind": "short", "label": "검토자", "min": 2, "optional": True},
}

# 키 접두어와 FIT_AXES 를 잇는다 (v4.0: 1축)
FIT_KEYS = ["rule_doc"]


# ────────────────────────────────────────────────────────────────────────────
# 4. 간이 ROI (FR-07) — 표준체계 문서② 양식 3번 「기대 효과」
#    수치가 하나라도 없으면 **계산하지 않고 사유를 반환**한다. (금칙 G-3)
# ────────────────────────────────────────────────────────────────────────────
def calc_roi(count_per_month, minutes_per_case, people=1, to_be_minutes=None) -> dict:
    """절감 = 건수/월 × 시간/건 × 인원.

    to_be_minutes 를 주면 (As-Is − To-Be) 기준 절감분을 함께 낸다.
    반환 dict 의 computed=False 이면 문서에는 `⬜ 미확보`로 적어야 한다.
    """
    out = {
        "computed": False, "reason": "", "cite": CITE["fea.roi"],
        "count_per_month": None, "minutes_per_case": None, "people": None,
        "as_is_hours_month": None, "to_be_hours_month": None,
        "saved_hours_month": None, "saved_hours_year": None, "saved_md_year": None,
        "formula": "", "inputs_raw": {
            "count_per_month": count_per_month, "minutes_per_case": minutes_per_case,
            "people": people, "to_be_minutes": to_be_minutes,
        },
    }

    c = parse_quantity(count_per_month, "count")
    t = parse_quantity(minutes_per_case, "minutes")
    p = parse_quantity(people, "people") if people not in (None, "") else {"ok": True, "value": 1.0}

    missing = []
    if not c["ok"]:
        missing.append(f"건수/월 — {c['reason']}")
    if not t["ok"]:
        missing.append(f"시간/건 — {t['reason']}")
    if not p["ok"]:
        missing.append(f"인원 — {p['reason']}")

    if missing:
        out["reason"] = ("정량 수치가 확보되지 않아 ROI를 산출하지 않았습니다. "
                         "추정치로 대체하지 않습니다(금칙 G-3). / " + " / ".join(missing))
        return out

    cnt, mins, ppl = c["value"], t["value"], p["value"]
    as_is = cnt * mins * ppl / 60.0

    to_be = None
    saved = as_is
    formula = f"{_n(cnt)}건/월 × {_n(mins)}분/건 × {_n(ppl)}명 ÷ 60 = {_n(as_is)}시간/월"

    if to_be_minutes not in (None, ""):
        tb = parse_quantity(to_be_minutes, "minutes")
        if not tb["ok"]:
            out["reason"] = f"To-Be 시간을 읽지 못해 절감분을 계산하지 않았습니다. ({tb['reason']})"
            return out
        to_be = cnt * tb["value"] * ppl / 60.0
        saved = as_is - to_be
        formula = (f"(As-Is {_n(mins)}분 − To-Be {_n(tb['value'])}분) × {_n(cnt)}건/월 × {_n(ppl)}명 ÷ 60 "
                   f"= {_n(saved)}시간/월")

    out.update(
        computed=True,
        count_per_month=cnt, minutes_per_case=mins, people=ppl,
        as_is_hours_month=round(as_is, 1),
        to_be_hours_month=(round(to_be, 1) if to_be is not None else None),
        saved_hours_month=round(saved, 1),
        saved_hours_year=round(saved * 12, 1),
        saved_md_year=round(saved * 12 / 8.0, 1),   # 1 M/D = 8h
        formula=formula,
    )
    return out


def _n(v) -> str:
    """숫자를 문서에 적기 좋게. 12.0 → 12, 12.34 → 12.3"""
    f = float(v)
    return str(int(f)) if abs(f - int(f)) < 1e-9 else f"{f:.1f}"


# ────────────────────────────────────────────────────────────────────────────
# 5. 트랙·유형·자율성 판정 (FR-08) — 표준체계 0.3 / 0.4절
# ────────────────────────────────────────────────────────────────────────────
TRACKS = ["하", "중", "상"]
SCOPES = ["개인", "팀", "부서", "3개부서이상", "전사"]
AUTONOMY = {
    "L0": "정보 제공만 (조회·요약·답변)",
    "L1": "초안 생성 (사람이 전부 검토 후 사용)",
    "L2": "제안 + 사람 승인 후 실행",
    "L3": "자동 실행 + 사후 사람 검토",
    "L4": "완전 자율",
}

TRACK_DOCS = {
    "하": "INT, FEA(약식), UG + OPS 등록(목록 1행)",
    "중": "INT, FEA, ARD, DES(핵심 항목), EVP/EVR, DEP, UG, OPS",
    "상": "전체 10종(INT·FEA·ARD·DES·EVP·EVR·DEP·UG·OPS·CHG), DES는 전 항목 상세",
}
TRACK_APPROVER = {
    "하": "팀장",
    "중": "팀장 + 현업 부서장",
    "상": "팀장 + 현업 부서장 + IT보안/정보보호",
}
TRACK_PILOT = {
    "하": "즉시 배포 가능",
    "중": "파일럿(2주) → 확산",
    "상": "파일럿(4주) + 승인 게이트 → 단계 확산",
}


def _up(cur: str, want: str) -> str:
    return want if TRACKS.index(want) > TRACKS.index(cur) else cur


def judge_track(a: dict) -> dict:
    """트랙 판정. **6개 기준을 전건 검사**한다 (규칙 누락 대응).

    a = {
      write_exec: bool,        # 시스템 쓰기/실행 권한          → 상
      sensitive: bool,         # 민감 개인정보(주민번호·건강·급여·인사평가) → 상
      identifying: bool,       # 업무 식별정보(사번·성명·소속·일정)        → 중 이상
      scope: str,              # SCOPES 중 하나                 → 중 이상
      damage_financial: bool,  # 오답이 금전적 손실·법적 문제로  → 상
      autonomy: str,           # "L0".."L4"  L2+                → 상
    }

    ⚠️ v3.1 에서 개인정보 기준이 **두 단계로 분리**됐다.
       v1.0: "개인정보·기밀정보를 다루는가 → 상" (하나)
       v3.1: 민감 개인정보 → 상 / 업무 식별정보 → 중 이상 (둘)
       사번·성명만 다루는 건은 v1.0 에서 상이었으나 v3.1 에서는 중이다.
       `sensitive` 는 이제 **민감 개인정보만** 뜻한다 — 기존 저장분은 그대로 상으로 읽힌다
       (보수적: 이미 상으로 판정된 건을 소급해 낮추지 않는다).
    """
    checks = []
    track = "하"

    # ① 쓰기/실행 권한
    v = bool(a.get("write_exec"))
    if v:
        track = _up(track, "상")
    checks.append({"id": "C1", "label": "시스템 쓰기/실행 권한 보유",
                   "answer": "예" if v else "아니오", "hit": v,
                   "effect": "상" if v else "-", "cite": CITE["track.write"]})

    # ② 민감 개인정보 — 주민번호·건강·급여·인사평가
    v = bool(a.get("sensitive"))
    if v:
        track = _up(track, "상")
    checks.append({"id": "C2", "label": "민감 개인정보 취급 (주민번호·건강·급여·인사평가)",
                   "answer": "예" if v else "아니오", "hit": v,
                   "effect": "상" if v else "-", "cite": CITE["track.sensitive"]})

    # ③ 사용 범위
    scope = a.get("scope") or "팀"
    if scope not in SCOPES:
        scope = "팀"
    v = scope in ("부서", "3개부서이상", "전사")
    if v:
        track = _up(track, "중")
    checks.append({"id": "C3", "label": "사용자 3개 부서 이상(부서 단위 이상 사용)",
                   "answer": scope, "hit": v,
                   "effect": "중 이상" if v else "-", "cite": CITE["track.scope"]})

    # ④ 오답의 최대 피해
    v = bool(a.get("damage_financial"))
    if v:
        track = _up(track, "상")
    checks.append({"id": "C4", "label": "오답이 금전적 손실·법적 문제로 이어짐",
                   "answer": "예" if v else "아니오", "hit": v,
                   "effect": "상" if v else "-", "cite": CITE["track.damage"]})

    # ⑤ 자율성
    lv = (a.get("autonomy") or "L1").upper()
    if lv not in AUTONOMY:
        lv = "L1"
    v = lv in ("L2", "L3", "L4")
    if v:
        track = _up(track, "상")
    checks.append({"id": "C5", "label": "자율성 L2 이상(제안 후 실행·자동 실행)",
                   "answer": f"{lv} — {AUTONOMY[lv]}", "hit": v,
                   "effect": "상" if v else "-", "cite": CITE["track.autonomy"]})

    # ⑥ 업무 식별정보 — 사번·성명·소속·일정 (v3.1 신설)
    vid = bool(a.get("identifying"))
    if vid:
        track = _up(track, "중")
    checks.append({"id": "C6", "label": "업무 식별정보 취급 (사번·성명·소속·일정)",
                   "answer": "예" if vid else "아니오", "hit": vid,
                   "effect": "중 이상" if vid else "-", "cite": CITE["track.identifying"]})

    hits = [c for c in checks if c["hit"]]
    n_crit = len(checks)
    if hits:
        basis = "; ".join(f"{c['id']} {c['label']}({c['answer']}) → {c['effect']}" for c in hits)
        reason = (f"트랙 판정 기준 {n_crit}개 중 {len(hits)}개 해당. 하나라도 해당하면 상위 트랙이므로 "
                  f"**{track} 트랙**으로 판정합니다. 근거: {basis}. [{CITE['track.base']}]")
    else:
        reason = (f"트랙 판정 기준 {n_crit}개 중 해당 없음 → 개인·팀 보조 도구로 보아 **하 트랙**. "
                  f"[{CITE['track.base']}]")

    return {
        "track": track, "checks": checks, "hit_count": len(hits), "reason": reason,
        "required_docs": TRACK_DOCS[track], "approver": TRACK_APPROVER[track],
        "pilot": TRACK_PILOT[track], "autonomy": lv, "autonomy_desc": AUTONOMY[lv],
        "cite": CITE["track.base"],
        "note": ("자율성 L2 이상은 실행 권한이 발생하므로 최소 상 트랙입니다. "
                 f"[{CITE['track.autonomy_table']}]") if v else "",
    }


def judge_type(a: dict) -> dict:
    """유형 판정 (0.4절). a = {needs_judgment: bool, has_rule_flow: bool, note: str}"""
    j = bool(a.get("needs_judgment"))
    r = bool(a.get("has_rule_flow"))

    if j and r:
        t, why = "혼합형", ("규칙 흐름 중 일부 단계에만 LLM의 해석·판단·생성이 개입합니다. "
                          f"LLM이 개입하는 부분에만 판단형 기준을 적용합니다. [{CITE['type.hybrid']}]")
        quality = "판단형 부분 = 평가셋 정답률 기준 / 규칙형 부분 = 테스트 케이스 전건(100%) 통과"
    elif j:
        t, why = "판단형", (f"해석·판단·생성이 필요합니다 → 판단형. [{CITE['type.question']}]")
        quality = "평가셋 기반 통계적 평가 (정답률 N% 이상) + 금칙 위반 0건"
    else:
        t, why = "규칙형", ("해석·판단·생성이 필요하지 않고 정해진 규칙·절차대로만 동작합니다 "
                          f"→ 규칙형. [{CITE['type.question']}]")
        quality = "테스트 케이스 전건(100%) 통과 + 예외 처리 확인"

    risks = {
        "판단형": "오답(환각) / 지식 최신성 / 범위 밖 질문 / 프롬프트 주입",
        "규칙형": "규칙 누락 / 연동 실패 / 입력 데이터 오류 / 권한 만료",
        "혼합형": "판단형 4종 + 규칙형 4종 모두 (LLM 개입 구간과 규칙 구간을 나눠 기재)",
    }[t]

    return {"type": t, "reason": why, "quality_rule": quality, "failure_modes": risks,
            "cite": CITE["type.question"]}


def judge_autonomy_consistency(level: str, track: str) -> dict:
    """자율성과 트랙의 정합성 점검 (0.3절 자율성-트랙 표)."""
    lv = (level or "L1").upper()
    min_track = {"L0": "하", "L1": "하", "L2": "상", "L3": "상", "L4": "상"}.get(lv, "하")
    ok = TRACKS.index(track) >= TRACKS.index(min_track)
    return {
        "level": lv, "desc": AUTONOMY.get(lv, ""), "min_track": min_track, "consistent": ok,
        "cite": CITE["track.autonomy_table"],
        "message": ("" if ok else
                    f"자율성 {lv}는 최소 {min_track} 트랙이어야 합니다. 현재 판정 {track} 트랙과 모순됩니다. "
                    f"[{CITE['track.autonomy_table']}]"),
    }


# ────────────────────────────────────────────────────────────────────────────
# 6. 민감정보 탐지·마스킹 (FR-11)
#    3중 방어 중 2단계. 1단계는 첫 화면 고지, 3단계는 로그 점검(운영).
# ────────────────────────────────────────────────────────────────────────────
# 워드바운드리(\b) 를 쓰지 않는다.
#   · 파이썬 re 에서 한글은 \w 라 "주민번호900101-1234567" 의 "호9" 에 경계가 없어 탐지를 놓친다.
#   · JS 의 \b 는 ASCII 기준이라 같은 문자열이 탐지된다 → 서버와 단독 HTML 의 동작이 갈린다.
# 두 엔진에서 동일하게 동작하도록 ASCII 룩어라운드로 고정한다.
SENSITIVE_PATTERNS = [
    # (id, 라벨, 정규식, 심각도 block|warn)
    ("rrn", "주민등록번호/외국인등록번호",
     r"(?<![0-9])\d{6}\s*[-–]\s*[1-8]\d{6}(?![0-9])", "block"),
    ("card", "카드번호",
     r"(?<![0-9])(?:\d{4}[-\s]){3}\d{4}(?![0-9])", "block"),
    ("account", "계좌번호",
     r"(?<![0-9])\d{2,6}[-–]\d{2,6}[-–]\d{2,7}(?![0-9])", "block"),
    ("passport", "여권번호",
     r"(?<![0-9A-Za-z])[MSRODmsrod]\d{8}(?![0-9])", "block"),
    ("driver", "운전면허번호",
     r"(?<![0-9])\d{2}[-–]\d{2}[-–]\d{6}[-–]\d{2}(?![0-9])", "block"),
    ("phone", "휴대전화번호",
     r"(?<![0-9])01[016789][-–\s]?\d{3,4}[-–\s]?\d{4}(?![0-9])", "warn"),
    ("email", "이메일 주소",
     r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "warn"),
]
_SENS_COMPILED = [(i, l, re.compile(p), s) for i, l, p, s in SENSITIVE_PATTERNS]

_RE_DATEISH = re.compile(r"^\d{4}[-–]\d{1,2}[-–]\d{1,2}$")
_RE_DOCNO = re.compile(r"^\d{4}[-–]\d{2,3}[-–]\d{2,3}$")
_RE_PHONEISH = re.compile(r"^0\d{1,2}[-–]")


def _is_false_positive(pid: str, s: str) -> bool:
    """날짜(2026-08-28)·문서번호(2026-008-001)·전화번호를 계좌번호로 오탐하지 않는다.

    전화번호는 phone 패턴이 warn 등급으로 따로 잡는다. 여기서 걸러내지 않으면
    같은 문자열이 account(block)로도 잡혀 경고가 아니라 차단이 되어버린다.
    """
    if pid != "account":
        return False
    if _RE_DATEISH.match(s) or _RE_DOCNO.match(s) or _RE_PHONEISH.match(s):
        return True
    return len(re.sub(r"\D", "", s)) < 10


def scan_sensitive(text: str) -> dict:
    """민감정보를 찾는다. 반환 hits 는 원문을 담지 않는다(로그 오염 방지)."""
    t = "" if text is None else str(text)
    hits, blocked = [], False
    for pid, label, rx, sev in _SENS_COMPILED:
        for m in rx.finditer(t):
            s = m.group(0)
            if _is_false_positive(pid, s):
                continue
            hits.append({"id": pid, "label": label, "severity": sev,
                         "at": m.start(), "sample": _mask_one(s)})
            if sev == "block":
                blocked = True
    return {
        "clean": not hits, "blocked": blocked, "hits": hits,
        "message": _sensitive_message(hits, blocked),
    }


def _sensitive_message(hits, blocked) -> str:
    if not hits:
        return ""
    kinds = sorted({h["label"] for h in hits})
    if blocked:
        return ("입력에 " + ", ".join(kinds) + " 로 보이는 값이 있습니다. "
                "이 앱은 개인정보·기밀정보를 취급하지 않습니다(ARD 9.1). "
                "해당 부분을 지우고 다시 입력해 주세요. 저장하지 않았습니다.")
    return ("입력에 " + ", ".join(kinds) + " 가 포함되어 있습니다. "
            "문서에는 마스킹해서 기록합니다. 꼭 필요한 정보가 아니면 지워 주세요.")


def _mask_one(s: str) -> str:
    keep = 2 if len(s) <= 8 else 4
    return s[:keep] + "•" * max(3, len(s) - keep - 2) + s[-2:]


def mask_sensitive(text: str) -> str:
    """문서·로그에 남길 때 쓰는 마스킹. (금칙 G-6)"""
    t = "" if text is None else str(text)
    for pid, _label, rx, _sev in _SENS_COMPILED:
        def _sub(m, _pid=pid):
            s = m.group(0)
            return s if _is_false_positive(_pid, s) else _mask_one(s)
        t = rx.sub(_sub, t)
    return t


# ────────────────────────────────────────────────────────────────────────────
# 7. 금칙 (Guardrail) G-1 ~ G-7 — ARD 8.3
#    "정답률과 무관하게 단 1건이라도 발생하면 G3 불통과"
# ────────────────────────────────────────────────────────────────────────────
GUARDRAILS = {
    "G-1": "상 트랙 조건(쓰기 권한/개인정보/L2 이상) 포함 입력을 하·중으로 판정하지 않는다",
    "G-2": "Go/Drop을 단정하지 않는다 (초안·근거만 제시)",
    "G-3": "정량 수치가 공란인 채로 ROI를 산출하지 않는다 (추정치 대입 금지)",
    "G-4": "표준체계 조항을 인용하지 않은 판정 근거를 제시하지 않는다",
    "G-5": "Drop 권고 시 대안 안내를 누락하지 않는다",
    "G-6": "민감정보(주민번호·계좌 등)를 문서에 그대로 기재하지 않는다",
    "G-7": "Out of Scope 기능 요청을 수행하지 않는다 (명시적 거절)."
           " ※ ARD 초안 작성은 2026-09-08 부터 범위 안이다 (여전히 초안이며 3자 서명은 사람이 한다)",
}

# G-2: 판정을 단정하는 표현. "권고", "초안" 이 함께 있으면 단정이 아니다.
_RE_VERDICT = re.compile(
    r"(Go\s*로?\s*(판정|확정|결정)|Drop\s*로?\s*(판정|확정|결정)|"
    r"(판정|결론)\s*[:：]\s*(Go|Drop)|최종\s*판정\s*[:：]?\s*(Go|Drop))", re.I)
_RE_HEDGE = re.compile(r"(권고|초안|제안|검토\s*필요|사람이\s*확정|담당자가\s*확정|G1)", re.I)

# ARD 3.3 Out of Scope — 요청 분류용
OUT_OF_SCOPE = [
    ("verdict", "Go/Drop 최종 판정", r"(Go|Drop)\s*(로|으로)?\s*(확정|결정)해|최종\s*판정\s*(해|내려)"),
    ("gate", "G1~G4 게이트 승인", r"(G[1-4])\s*(승인|통과)\s*(해|처리|시켜)|게이트\s*승인"),
    ("external", "외부 시스템(SharePoint·그룹웨어) 등록·상신",
     r"(쉐어포인트|셰어포인트|share\s*point|sharepoint|그룹웨어|전자결재)\s*[에]?\s*(등록|올려|업로드|상신|기안)"),
    # 워드바운드리(\b) 금지: 파이썬 re 에서 한글은 \w 라 "ARD도" 에 경계가 생기지 않고,
    # JS 의 \b 는 ASCII 기준이라 경계가 생겨 서버와 단독 HTML 의 동작이 갈린다. ASCII 룩어라운드로 고정.
    # "ARD도 같이 써줘" 처럼 사이에 말이 끼는 경우까지 잡되, 문장을 넘지는 않도록 길이를 묶는다.
    # ARD 는 2026-09-08 부터 In Scope 로 옮겼다 (초안 생성까지 — 3자 서명은 사람).
    # 나머지 후속 문서는 그대로 거절한다.
    ("later_doc", "설계 이후 문서(DES·EVD·UG·OPS·CHG) 생성",
     r"(?<![A-Za-z])(DES|EVD|EVP|EVR|DEP|UG|OPS|CHG)(?![A-Za-z])[^.!?\n]{0,12}?(써|작성|만들|생성)"),
    ("priority", "요구 간 우선순위 결정·리소스 배정",
     r"(우선순위|priority)\s*(를)?\s*(정해|매겨|결정)|(리소스|인력)\s*(를)?\s*(배정|할당)"),
    ("collect", "회의 음성·화면 자동 수집, 메일함 자동 스캔",
     r"(회의)\s*(녹음|음성|화면)\s*(수집|녹화|캡처)|메일함?\s*(을)?\s*(스캔|읽어|자동\s*수집)"),
    ("amend_std", "표준체계 문서 자체의 개정·해석 변경",
     r"표준체계\s*(를)?\s*(고쳐|수정|개정|바꿔)"),
]
_OOS_COMPILED = [(k, l, re.compile(p, re.I)) for k, l, p in OUT_OF_SCOPE]


def detect_out_of_scope(text: str) -> dict:
    """Out of Scope 요청인지 (FR-범위 밖 질문 / 금칙 G-7)."""
    t = "" if text is None else str(text)
    for key, label, rx in _OOS_COMPILED:
        if rx.search(t):
            return {
                "out_of_scope": True, "key": key, "label": label,
                "refusal": (f"“{label}”은(는) 이 에이전트의 범위 밖입니다(ARD 3.3 Out of Scope). "
                            "이 에이전트는 INT·FEA·ARD 초안과 판정 근거까지만 만들고, "
                            "확정·승인·외부 시스템 등록은 사람이 합니다. "
                            "대신 필요한 근거를 정리해 드릴 수는 있습니다."),
            }
    return {"out_of_scope": False, "key": None, "label": "", "refusal": ""}


def check_guardrails(ctx: dict) -> dict:
    """산출 직전 금칙 검사. ctx 는 아래 키를 (있는 만큼) 담는다.

      text          : 사용자에게 나갈 응답/문서 전문
      track_result  : judge_track() 결과
      track_answers : judge_track() 입력
      roi           : calc_roi() 결과
      roi_written   : 문서에 ROI 숫자를 적었는가 (bool)
      judgements    : 판정 서술 문자열 리스트 (인용 포함 여부 검사)
      recommendation: "Go" | "Conditional Go" | "Drop" | ""
      alternatives  : Drop 권고 시 대안 안내 문자열
      user_request  : 원 요청 (Out of Scope 검사)
    """
    v = []

    def bad(gid, detail):
        v.append({"id": gid, "rule": GUARDRAILS[gid], "detail": detail})

    text = ctx.get("text") or ""

    # G-1 — 상 트랙 조건이 있는데 하·중으로 판정
    tr, ta = ctx.get("track_result"), ctx.get("track_answers")
    if tr and ta:
        forced = [c for c in tr.get("checks", []) if c["hit"] and c["effect"] == "상"]
        if forced and tr.get("track") != "상":
            bad("G-1", "상 트랙 조건 해당: " + ", ".join(c["label"] for c in forced)
                + f" — 그런데 판정은 {tr.get('track')} 트랙")

    # G-2 — Go/Drop 단정
    for m in _RE_VERDICT.finditer(text):
        s, e = max(0, m.start() - 60), min(len(text), m.end() + 60)
        if not _RE_HEDGE.search(text[s:e]):
            bad("G-2", f"단정 표현 “{m.group(0)}” — 권고·초안임이 함께 표시되어야 합니다")
            break

    # G-3 — 수치 없이 ROI
    roi = ctx.get("roi")
    if roi is not None and not roi.get("computed") and ctx.get("roi_written"):
        bad("G-3", "정량 수치가 확보되지 않았는데 ROI 수치가 문서에 기재되었습니다")

    # G-4 — 인용 없는 판정
    for j in (ctx.get("judgements") or []):
        s = str(j)
        if s.strip() and not re.search(r"표준체계\s*\d\.\d|표준체계\s*문서|0\.[34]\s*절", s):
            bad("G-4", f"조항 인용 없는 판정 서술: “{s[:60]}…”")
            break

    # G-5 — Drop 권고인데 대안 없음
    if (ctx.get("recommendation") or "").strip().lower().startswith("drop"):
        if not (ctx.get("alternatives") or "").strip():
            bad("G-5", "Drop 권고인데 대안 안내가 비어 있습니다")

    # G-6 — 문서에 민감정보 원문
    sc = scan_sensitive(text)
    if sc["hits"]:
        bad("G-6", "출력에 민감정보로 보이는 값: " + ", ".join(sorted({h["label"] for h in sc["hits"]})))

    # G-7 — Out of Scope 수행
    ureq = ctx.get("user_request")
    if ureq:
        oos = detect_out_of_scope(ureq)
        if oos["out_of_scope"] and "범위 밖" not in text and "Out of Scope" not in text:
            bad("G-7", f"범위 밖 요청(“{oos['label']}”)에 대해 명시적 거절이 없습니다")

    return {"passed": not v, "violations": v, "checked": list(GUARDRAILS.keys())}


# ────────────────────────────────────────────────────────────────────────────
# 8. 문서 스펙 (FR-04 / FR-10) — 표준체계 문서①·② 양식
#    스펙은 데이터다. 렌더러(render_doc)와 검증기(validate_doc)는 스펙을 걷기만 한다.
#    → build_html.py 가 이 스펙을 JSON 으로 주입해 단독 HTML 도 같은 문서를 만든다.
#
#    field kind: text(한 줄) | long(여러 줄) | table(rows: [[..],[..]])
#    req=True 인 항목이 비면 문서에 `⬜ 미확보` 로 표기되고 validate_doc 이 잡는다.
# ────────────────────────────────────────────────────────────────────────────
MISSING_MARK = "⬜ 미확보"

INT_SPEC = {
    "code": "INT",
    "title": "에이전트 요구 접수서",
    "cite": CITE["int.form"],
    "sections": [
        {"n": 1, "title": "요구자 / 부서 / 접수일", "fields": [
            {"k": "requester_name", "label": "요구자", "kind": "text", "req": True},
            {"k": "requester_dept", "label": "부서", "kind": "text", "req": True},
            {"k": "requester_contact", "label": "연락처", "kind": "text", "req": False},
            {"k": "received_at", "label": "접수일", "kind": "text", "req": True,
             "hint": "시스템 자동 입력"},
        ]},
        {"n": 2, "title": "어떤 업무가 힘든가요?  ★필수", "fields": [
            {"k": "problem", "label": "문제 서술", "kind": "long", "req": True,
             "hint": "해결책이 아니라 고통을 적는다"},
            {"k": "who", "label": "누가", "kind": "text", "req": True},
            {"k": "frequency", "label": "얼마나 자주", "kind": "text", "req": True,
             "hint": "반드시 숫자로 (건/월 등)"},
            {"k": "minutes", "label": "몇 분씩", "kind": "text", "req": True,
             "hint": "반드시 숫자로 (분 또는 시간)"},
            {"k": "people", "label": "인원", "kind": "text", "req": False},
            {"k": "pain_point", "label": "어느 부분이 가장 번거롭거나 실수가 잦은가", "kind": "long", "req": True},
        ]},
        {"n": 3, "title": "지금은 어떻게 처리하나요?", "fields": [
            {"k": "as_is", "label": "처리 방식", "kind": "long", "req": True},
            {"k": "systems", "label": "사용 시스템·파일", "kind": "text", "req": True,
             "hint": "그룹웨어, Excel, SAP 등"},
            {"k": "refs", "label": "참고 규정", "kind": "text", "req": False,
             "hint": "있으면 링크"},
        ]},
        {"n": 4, "title": "잘못 처리되면 어떤 일이 생기나요?  ★필수", "fields": [
            {"k": "risk", "label": "잘못 처리되면 생기는 일", "kind": "long", "req": True},
        ]},
        {"n": 5, "title": "희망 시점과 이유", "fields": [
            {"k": "when", "label": "희망 시점", "kind": "text", "req": True},
            {"k": "why_urgent", "label": "이유", "kind": "long", "req": False},
        ]},
        # ── 본문은 여기까지. 표준체계 문서①은 1~5번 1페이지다. ────────────────
        # 아래는 양식 항목이 아니라 접수 관리용 메타데이터라 번호를 붙이지 않는다.
        # (체계 원칙 ⑤ "원문을 본문에 넣지 않는다 — 별첨으로 분리한다", 원칙 ⑦ 분량 상한)
        {"n": "별첨", "title": "접수 처리 (시스템 자동 입력)", "fields": [
            {"k": "project_no", "label": "프로젝트 번호", "kind": "text", "req": True},
            {"k": "assignee", "label": "담당 배정", "kind": "text", "req": False},
            {"k": "interview_at", "label": "초기 인터뷰 일정", "kind": "text", "req": False},
            # v1.0 4번 「어떻게 되면 좋겠나요(To-Be)」. v3.1 양식에서 빠졌다 —
            # 해결책을 먼저 묻게 되어 "고통을 묻는다" 원칙과 어긋나기 때문.
            # 새 접수에서는 묻지 않지만, 옛 접수 건의 값까지 지워 버리지는 않는다.
            {"k": "to_be", "label": "기대 모습 (구 v1.0 양식 항목)", "kind": "long",
             "req": False, "legacy": True},
        ]},
    ],
}

FEA_SPEC = {
    "code": "FEA",
    "title": "타당성 평가서",
    "cite": CITE["fea.form"],
    "sections": [
        {"n": 1, "title": "요구 요약 (3줄)", "fields": [
            {"k": "summary", "label": "요약", "kind": "long", "req": True},
        ]},
        {"n": 2, "title": "대안 검토  ★필수", "fields": [
            {"k": "alt_process", "label": "프로세스/규정 개선으로 해결 가능한가?", "kind": "long", "req": True},
            {"k": "alt_system", "label": "기존 시스템 기능/설정으로 가능한가?", "kind": "long", "req": True},
            {"k": "alt_macro", "label": "매크로/엑셀로 충분한가?", "kind": "long", "req": True},
            {"k": "alt_llm", "label": "단순 LLM 챗 활용(가이드 배포)으로 충분한가?", "kind": "long", "req": True},
            {"k": "alt_conclusion", "label": "▶ 결론: 에이전트 개발이 타당한 이유", "kind": "long", "req": True},
        ]},
        # v4.0: "대략의 절감 효과. 정밀한 수치나 금액 환산은 요구하지 않는다."
        # 「예상 개발 공수」·「품질 개선 기대」 는 v4.0 양식에서 사라졌다 — 삭제.
        {"n": 3, "title": "기대 효과 (한 줄)", "fields": [
            {"k": "roi_saving", "label": "대략의 절감 효과", "kind": "long", "req": True,
             "hint": "정밀한 수치나 금액 환산은 요구하지 않는다"},
        ]},
        {"n": 4, "title": "트랙·유형 판정  ★필수", "fields": [
            {"k": "risk_write", "label": "쓰기 권한", "kind": "text", "req": True},
            {"k": "risk_sensitive", "label": "민감정보", "kind": "text", "req": True},
            {"k": "risk_scope", "label": "사용 범위", "kind": "text", "req": True},
            {"k": "risk_damage", "label": "오답 최대 피해", "kind": "long", "req": True},
            {"k": "verdict_type", "label": "▶ 유형 판정", "kind": "text", "req": True},
            {"k": "verdict_track", "label": "▶ 트랙 판정", "kind": "text", "req": True},
            {"k": "verdict_autonomy", "label": "▶ 자율성 수준 초안", "kind": "text", "req": True},
            {"k": "verdict_basis", "label": "판정 근거 (표준체계 조항 인용)", "kind": "table", "req": True,
             "cols": ["기준", "응답", "적용", "근거 조항"]},
        ]},
        {"n": 5, "title": "Go / Drop 판정  ★필수", "fields": [
            # v4.0 문서② — "규칙(로직) 문서화가 어려우면 조건부 Go를 검토한다"
            {"k": "fit_table", "label": "판단 규칙의 문서화 가능성", "kind": "table", "req": False,
             "cols": ["항목", "판정", "근거"]},
            # 표준체계 문서② 양식의 3지선다 체크란. 에이전트는 체크하지 않는다 (금칙 G-2).
            {"k": "decision", "label": "판정 — 담당자·팀장 확정 (G1)", "kind": "long", "req": True,
             "hint": "에이전트는 공란으로 둔다"},
            {"k": "agent_verdict", "label": "▶ 에이전트 권고 (참고용)", "kind": "text", "req": True},
            {"k": "verdict_reasons", "label": "권고 근거", "kind": "table", "req": True,
             "cols": ["구분", "확인 내용", "판정에 미친 영향", "근거 조항"]},
            {"k": "verdict_conditions", "label": "해소해야 할 조건 (Conditional Go 권고 시)",
             "kind": "long", "req": False},
            {"k": "recommendation", "label": "권고 사유 (상세)", "kind": "long", "req": True},
            {"k": "drop_alternatives", "label": "Drop 권고 시 대안 안내", "kind": "long", "req": False},
        ]},
        {"n": 6, "title": "승인", "fields": [
            {"k": "written_by", "label": "작성", "kind": "text", "req": True},
            {"k": "reviewed_by", "label": "검토", "kind": "text", "req": False},
            {"k": "approved_by", "label": "승인(팀장)", "kind": "text", "req": False},
            {"k": "approved_at", "label": "일자", "kind": "text", "req": False},
        ]},
        # 표준체계 문서②는 1~6번 A4 1장. 별첨 없음 (v4.0 적합성 5축 삭제).
    ],
}

ARD_SPEC = {
    "code": "ARD",
    "title": "에이전트 요구사항 정의서",
    "cite": CITE["ard.form"],
    "sections": [
        {"n": 1, "title": "한 줄 정의  ★필수", "fields": [
            {"k": "one_line", "label": "이 에이전트는 …", "kind": "long", "req": True,
             "hint": "[사용자]가 [업무]를 할 때 [무엇]을 [어디까지] 해준다"},
            {"k": "scope_limit", "label": "▶ “어디까지” (자율성과 직결)", "kind": "long", "req": True},
        ]},
        {"n": 2, "title": "범위 선언  ★필수", "fields": [
            {"k": "in_scope", "label": "In Scope — 하는 일 (번호 매겨 열거)", "kind": "long", "req": True},
            {"k": "out_scope", "label": "Out of Scope — 하지 않는 일 (명시적으로!)", "kind": "long", "req": True},
            {"k": "human_point", "label": "사람 개입 지점 — 어디서 사람이 확인·승인하는가",
             "kind": "long", "req": True},
        ]},
        {"n": 3, "title": "자율성 수준  ★필수", "fields": [
            {"k": "autonomy_level", "label": "이 에이전트", "kind": "text", "req": True,
             "hint": "L0 정보 제공 / L1 초안 생성 / L2 승인 후 실행 / L3 자동 실행 / L4 완전 자율"},
            {"k": "autonomy_reason", "label": "근거", "kind": "long", "req": True},
            {"k": "autonomy_upgrade", "label": "향후 상향 조건", "kind": "long", "req": False},
        ]},
        {"n": 4, "title": "기능 요구사항 (FR)", "fields": [
            {"k": "fr_table", "label": "기능 목록 — 3요소가 빠진 FR은 반려", "kind": "table", "req": False,
             "cols": ["ID", "기능명", "입력", "행동", "출력", "M/S/C"]},
        ]},
        {"n": 5, "title": "지식·데이터", "fields": [
            {"k": "knowledge_refs", "label": "참조 규정·매뉴얼 (파일명, 버전, 관리 부서)",
             "kind": "long", "req": False},
            {"k": "knowledge_data", "label": "연동 데이터 (접근 방식, 권한)", "kind": "long", "req": False},
            {"k": "knowledge_owner", "label": "갱신 담당자 — 개인 지정", "kind": "text", "req": True,
             "hint": "“○○팀”은 곧 아무도 안 한다는 뜻"},
        ]},
        {"n": 6, "title": "보안·제약", "fields": [
            {"k": "sec_class", "label": "데이터 분류", "kind": "text", "req": False},
            {"k": "sec_platform", "label": "승인된 플랫폼", "kind": "text", "req": False},
            {"k": "sec_log", "label": "로그 범위", "kind": "text", "req": False},
            {"k": "constraints", "label": "일정·조직 제약", "kind": "long", "req": False},
        ]},
        {"n": 7, "title": "합의", "fields": [
            # 3자 서명란. 에이전트는 채우지 않는다 (금칙 G-2 와 같은 원리).
            {"k": "agreement", "label": "요구자 / 오너 / AI 활성화팀장 / 일자", "kind": "long", "req": True,
             "hint": "에이전트는 공란으로 둔다 — G2 에서 3자가 서명한다"},
        ]},
    ],
}

# ── ARD 슬롯 품질 기준 ──────────────────────────────────────────────────
# v4.0 문서③: "자율성 수준과 Out of Scope가 필수다. 둘이 없는 ARD는 반려한다."
# 그 셋(1·2·3번)만 필수로 두고, 4~6번은 워크숍에서 채운다 — 요구자가 답할 수 없는 항목이다.
# 판단 기준은 INT·FEA 와 같다: "이 항목만 읽고 무슨 일인지 알 수 있는가."
ARD_SLOT_RULES = {
    "one_line":        {"kind": "narrative", "label": "한 줄 정의", "min": 20},
    "scope_limit":     {"kind": "narrative", "label": "어디까지 해주는가", "min": 10},
    "in_scope":        {"kind": "narrative", "label": "In Scope", "min": 15},
    "out_scope":       {"kind": "narrative", "label": "Out of Scope", "min": 12},
    "human_point":     {"kind": "narrative", "label": "사람 개입 지점", "min": 10},
    "autonomy_reason": {"kind": "narrative", "label": "자율성 근거", "min": 10},
    "autonomy_upgrade": {"kind": "short", "label": "향후 상향 조건", "min": 4, "optional": True},
    "knowledge_owner": {"kind": "short", "label": "지식 갱신 담당자", "min": 2},
    "knowledge_refs":  {"kind": "short", "label": "참조 규정·매뉴얼", "min": 4, "optional": True},
    "knowledge_data":  {"kind": "short", "label": "연동 데이터", "min": 4, "optional": True},
    "constraints":     {"kind": "short", "label": "일정·조직 제약", "min": 4, "optional": True},
    "sec_class":       {"kind": "short", "label": "데이터 분류", "min": 2, "optional": True},
    "sec_platform":    {"kind": "short", "label": "승인된 플랫폼", "min": 2, "optional": True},
    "sec_log":         {"kind": "short", "label": "로그 범위", "min": 2, "optional": True},
}

# G2 통과 조건 3종 (0.6절) — 이것만 갖추면 미팅으로 넘길 수 있다
ARD_G2_KEYS = ("one_line", "scope_limit", "in_scope", "out_scope", "human_point", "autonomy_reason")


def assess_ard(form: dict) -> dict:
    return assess_form(form, ARD_SLOT_RULES)


def ard_ready_for_meeting(form: dict) -> dict:
    """미팅에 들고 갈 수준인가 = G2 통과 조건 3종(1·2·3번)이 서 있는가.

    4~6번은 워크숍에서 채우는 것이 정상이므로 여기서 붙잡지 않는다.
    """
    a = assess_ard(form or {})
    blocking = [k for k in ARD_G2_KEYS if (a["slots"].get(k) or {}).get("grade") != "ok"]
    return {
        "ready": not blocking, "blocking": blocking, "assess": a,
        "cite": CITE["gate.g2"],
        "note": ("G2 통과 조건 3종(한 줄 정의·범위 선언·자율성 수준)이 서 있습니다. "
                 "나머지는 워크숍에서 채웁니다."
                 if not blocking else
                 "아래 항목이 서야 미팅에 들고 갈 수 있습니다: "
                 + ", ".join((a["slots"][k] or {}).get("label", k) for k in blocking)),
    }


SPECS = {"INT": INT_SPEC, "FEA": FEA_SPEC, "ARD": ARD_SPEC}


def _val(v):
    """빈 값이면 None. 표·문자열 공통."""
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        return list(v) or None
    s = str(v).strip()
    return s or None


def validate_doc(spec: dict, data: dict) -> dict:
    """필수 항목 누락 검사 (FR-04·FR-10). 누락은 막지 않고 `⬜` 로 드러낸다."""
    missing, filled, total = [], 0, 0
    for sec in spec["sections"]:
        for f in sec["fields"]:
            v = _val(data.get(f["k"]))
            # legacy = 구 양식(v1.0)에만 있던 항목. 값이 없으면 아예 없는 셈 친다.
            if f.get("legacy") and v is None:
                continue
            total += 1
            if v is None:
                if f.get("req"):
                    missing.append({"section": sec["n"], "key": f["k"], "label": f["label"]})
            else:
                filled += 1
    req_total = sum(1 for s in spec["sections"] for f in s["fields"] if f.get("req"))
    return {
        "ok": not missing, "missing": missing,
        "filled": filled, "total": total,
        "required_total": req_total, "required_missing": len(missing),
        "completeness": round(filled * 100.0 / total) if total else 0,
    }


def render_doc(spec: dict, data: dict, meta: dict | None = None) -> str:
    """스펙 + 값 → Markdown 문서. 값이 없는 필수 항목은 `⬜ 미확보` 로 남는다.

    민감정보는 여기서 한 번 더 마스킹한다 (금칙 G-6 최종 방어).
    """
    meta = meta or {}
    doc_no = meta.get("doc_no") or f"YYYY-NNN-{spec['code']}"
    out = [f"# {spec['title']} ({doc_no})", ""]

    head = []
    if meta.get("agent_name"):
        head.append(f"| 에이전트(가칭) | {meta['agent_name']} |")
    if meta.get("created_at"):
        head.append(f"| 작성일 | {meta['created_at']} |")
    if meta.get("standard"):
        head.append(f"| 표준체계 기준일 | {meta['standard']} |")
    if meta.get("author"):
        head.append(f"| 작성 | {meta['author']} |")
    if head:
        out += ["| 항목 | 내용 |", "|---|---|"] + head + [""]

    out += ["> 이 문서는 **에이전트가 생성한 초안**입니다. 담당자 검토 전에는 확정 문서가 아닙니다.",
            f"> 양식 근거: {spec['cite']}", ""]

    for sec in spec["sections"]:
        out.append(f"## {sec['n']}. {sec['title']}")
        out.append("")
        for f in sec["fields"]:
            v = _val(data.get(f["k"]))
            label = f["label"]

            # 구 양식 잔여 항목은 값이 있을 때만 싣는다 (없으면 줄 자체를 만들지 않는다)
            if f.get("legacy") and v is None:
                continue

            if f["kind"] == "table":
                cols = f.get("cols") or []
                # 앞 항목이 불릿이면 빈 줄을 넣어야 표가 제대로 렌더된다
                if out and out[-1].strip():
                    out.append("")
                if not v:
                    out += [f"**{label}**", "", MISSING_MARK, ""]
                    continue
                out += [f"**{label}**", ""]
                out.append("| " + " | ".join(cols) + " |")
                out.append("|" + "|".join(["---"] * len(cols)) + "|")
                for row in v:
                    cells = [mask_sensitive(str(c)).replace("|", "\\|").replace("\n", " ")
                             for c in list(row)[:len(cols)]]
                    cells += [""] * (len(cols) - len(cells))
                    out.append("| " + " | ".join(cells) + " |")
                out.append("")
                continue

            if v is None:
                shown = MISSING_MARK if f.get("req") else "—"
                out.append(f"- **{label}**: {shown}")
                continue

            text = mask_sensitive(str(v))
            if f["kind"] == "long" and "\n" in text:
                out.append(f"- **{label}**:")
                out += ["  " + ln for ln in text.split("\n")]
            else:
                out.append(f"- **{label}**: {text}")
        out.append("")

    v = validate_doc(spec, data)
    if v["missing"]:
        out += ["---", "",
                f"> ⚠️ **미확보 필수 항목 {len(v['missing'])}개** — "
                + ", ".join(f"{m['section']}번 {m['label']}" for m in v["missing"]),
                "> 추정치로 채우지 않았습니다. 담당자가 확인해 주세요.", ""]
    return "\n".join(out).rstrip() + "\n"


# ────────────────────────────────────────────────────────────────────────────
# 9. INT → FEA 브리지 · 문서 번호 (FR-08 / FR-14)
# ────────────────────────────────────────────────────────────────────────────
_RE_DOC_NO = re.compile(r"^(?P<y>\d{4})-(?P<n>\d{3})(?:-(?P<c>INT|FEA))?$")


def make_doc_no(year: int, seq: int, code: str = "") -> str:
    """{연도}-{일련번호}-{문서코드} (표준체계 0.2절)."""
    base = f"{int(year):04d}-{int(seq):03d}"
    return f"{base}-{code}" if code else base


def parse_doc_no(s: str) -> dict | None:
    m = _RE_DOC_NO.match((s or "").strip().upper())
    if not m:
        return None
    return {"year": int(m.group("y")), "seq": int(m.group("n")),
            "code": m.group("c") or "", "project_no": f"{m.group('y')}-{m.group('n')}"}


def next_seq(existing_nos, year: int | None = None) -> int:
    """기존 번호 목록에서 다음 일련번호. 프로젝트 번호는 연도별로 이어 붙인다."""
    year = year or date.today().year
    mx = 0
    for s in existing_nos or []:
        p = parse_doc_no(s)
        if p and p["year"] == year:
            mx = max(mx, p["seq"])
    return mx + 1


# v4.0 문서②에서 「적합성 진단 5축」 은 근거를 잃었다. 양식에도 심화 노트에도 없다.
# 남은 것은 단 하나 — "규칙(로직) 문서화가 어려우면 조건부 Go를 검토한다".
# 근거 없는 4축(데이터 접근성·오류 허용도·반복성·정치적 이슈)은 삭제한다.
# 물음 10개가 2개로 줄어든다. 속도가 곧 활성화라는 v4.0 기조와 같은 방향이다.
FIT_AXES = [
    ("rule_doc", "판단 규칙을 문서로 적을 수 있는가", "규정·기준이 글로 존재하는가"),
]
ALT_ITEMS = [
    ("alt_process", "프로세스/규정 개선"),
    ("alt_system", "기존 시스템 기능/설정"),
    ("alt_macro", "매크로/엑셀"),
    ("alt_llm", "단순 LLM 챗(가이드 배포)"),
]


def fea_form_to_parts(form: dict) -> dict:
    """좌측 FEA 양식(평평한 dict) → 엔진이 쓰는 조각들로 나눈다.

    양식은 화면이 다루기 쉬운 평평한 구조이고, 엔진은 축·항목별 구조를 쓴다.
    두 표현을 잇는 곳은 여기 한 곳뿐이다.
    """
    f = form or {}
    fit = {}
    for key in FIT_KEYS:
        fit[key] = {"grade": (f.get(f"fit_{key}_grade") or "").strip(),
                    "reason": (f.get(f"fit_{key}_reason") or "").strip()}
    alts = {k: (f.get(k) or "").strip() or None for k in
            ("alt_process", "alt_system", "alt_macro", "alt_llm", "alt_conclusion",
             "roi_saving")}
    return {
        "fit": fit, "alts": alts,
        "summary": (f.get("summary") or "").strip(),
        "author": (f.get("written_by") or "").strip(),
        "reviewer": (f.get("reviewed_by") or "").strip(),
        "approver": (f.get("approved_by") or "").strip(),
        "approved_at": (f.get("approved_at") or "").strip(),
        "damage_desc": (f.get("damage_desc") or "").strip(),
        "decision": (f.get("decision") or "").strip(),
    }


def build_fea_data(int_data: dict, judgement: dict, fit: dict, alts: dict,
                   roi: dict, summary: str = "", author: str = "",
                   extra: dict | None = None) -> dict:
    """엔진 산출물을 FEA_SPEC 이 기대하는 평평한 dict 로 옮긴다.

    judgement = {"track": judge_track(...), "type": judge_type(...), "autonomy": judge_autonomy_consistency(...)}
    fit       = {axis_key: {"grade": "상|중|하", "reason": "..."}}
    alts      = {alt_key: "검토 결과 서술", "alt_conclusion": "..."}
    extra     = 사람이 채운 나머지 (damage_desc / decision / reviewer / approver / approved_at)
    """
    extra = extra or {}
    tr = judgement.get("track") or {}
    ty = judgement.get("type") or {}
    au = judgement.get("autonomy") or {}

    fit_rows = []
    for key, label, hint in FIT_AXES:
        f = (fit or {}).get(key) or {}
        fit_rows.append([label, f.get("grade") or MISSING_MARK,
                         f.get("reason") or f"({hint})"])

    basis_rows = [[c["label"], c["answer"], c["effect"], c["cite"]]
                  for c in tr.get("checks", [])]
    if ty.get("reason"):
        basis_rows.append(["유형 판정", ty.get("type", ""), ty.get("type", ""), ty.get("cite", "")])
    if au.get("message"):
        basis_rows.append(["자율성 정합성", au.get("level", ""), "모순", au.get("cite", "")])

    # v4.0 3번은 "대략의 절감 효과" 한 줄이다. 사람이 적은 한 줄이 원본이고,
    # 계산이 됐으면 참고로 덧붙인다. 계산이 안 돼도 그것은 흠이 아니다.
    written = (alts or {}).get("roi_saving")
    if roi.get("computed"):
        calc = (f"(참고 계산) {roi['formula']} · "
                f"연 {_n(roi['saved_hours_year'])}시간 ≈ {_n(roi['saved_md_year'])} M/D")
        saving = (written + "\n" + calc) if written else calc
    else:
        saving = written or f"{MISSING_MARK} — 대략의 절감 효과를 한 줄로 적어 주세요."

    # Go / Conditional Go / Drop 권고 — 참고용. 확정은 사람 (금칙 G-2)
    rec = recommend_verdict(tr, ty, au, roi, fit, alts,
                            extra.get("alt_sufficient"), extra.get("assess"))

    return {
        "summary": summary or _three_line_summary(int_data),
        "alt_process": (alts or {}).get("alt_process"),
        "alt_system": (alts or {}).get("alt_system"),
        "alt_macro": (alts or {}).get("alt_macro"),
        "alt_llm": (alts or {}).get("alt_llm"),
        "alt_conclusion": (alts or {}).get("alt_conclusion"),
        "fit_table": fit_rows,
        "roi_saving": saving,
        "risk_write": _yn(tr, "C1"),
        "risk_sensitive": _yn(tr, "C2"),
        "risk_scope": _ans(tr, "C3"),
        # 4번 "오답 최대 피해" 는 사람이 쓴 서술이 원본이다. 없으면 트랙 응답(예/아니오)으로 대신한다.
        "risk_damage": extra.get("damage_desc") or _ans(tr, "C4"),
        "verdict_type": f"{ty.get('type', MISSING_MARK)} — {ty.get('reason', '')}",
        "verdict_track": f"{tr.get('track', MISSING_MARK)} 트랙 — {tr.get('reason', '')}",
        "verdict_autonomy": (f"{au.get('level', '')} ({au.get('desc', '')})"
                             + (f"  ⚠️ {au['message']}" if au.get("message") else "")),
        "verdict_basis": basis_rows,
        # 표준체계 문서② 5번 3지선다. 에이전트는 체크하지 않는다 (금칙 G-2).
        # 담당자가 화면에서 고른 값이 있으면 그것만 기재한다.
        "decision": ((f"**담당자 기재: {extra['decision']}**  (G1 최종 확정은 팀장)\n\n"
                      + verdict_checkbox(rec["verdict"]))
                     if extra.get("decision") else verdict_checkbox(rec["verdict"])),
        "agent_verdict": (f"**{rec['verdict']}**  (확신도 {rec['confidence']}) — 참고용. "
                          f"확정은 담당자·팀장이 G1 에서 합니다."),
        "verdict_reasons": [[r["area"], r["finding"], r["effect"], r["cite"]]
                            for r in rec["reasons"]] or None,
        "verdict_conditions": ("\n".join(f"{i}. {c}" for i, c in enumerate(rec["conditions"], 1))
                               if rec["conditions"] else None),
        "recommendation": rec["text"],
        "drop_alternatives": rec["alternatives"] or None,
        "written_by": author or "(에이전트 초안)",
        "reviewed_by": extra.get("reviewer") or None,
        "approved_by": extra.get("approver") or None,
        "approved_at": extra.get("approved_at") or None,
        "_verdict": rec,   # 화면용 — render_doc 은 밑줄 키를 무시한다
    }


def _yn(tr, cid):
    for c in tr.get("checks", []):
        if c["id"] == cid:
            return c["answer"]
    return MISSING_MARK


def _ans(tr, cid):
    return _yn(tr, cid)


def _three_line_summary(d: dict) -> str:
    who = _val(d.get("who")) or "?"
    freq = _val(d.get("frequency")) or "?"
    mins = _val(d.get("minutes")) or "?"
    prob = _val(d.get("problem")) or MISSING_MARK
    # v3.1 INT 3번. v1.0 때는 ② 가 「기대 모습(To-Be)」 이었으나 그 항목이 없어졌다.
    as_is = _val(d.get("as_is")) or _val(d.get("to_be")) or MISSING_MARK
    risk = _val(d.get("risk")) or MISSING_MARK
    return (f"① {who}가 {freq}, 건당 {mins} 소요하는 업무: {prob}\n"
            f"② 현재 처리 방식: {as_is}\n"
            f"③ 잘못 처리되면: {risk}")


# ────────────────────────────────────────────────────────────────────────────
# 10. 판정 권고 (Go / Conditional Go / Drop) — 표준체계 문서② 5번
#     **권고이지 판정이 아니다.** 확정은 담당자·팀장이 G1 에서 한다 (금칙 G-2).
#     사람이 참고할 수 있도록 근거를 항목별로 남긴다.
# ────────────────────────────────────────────────────────────────────────────
VERDICTS = ["Go", "Conditional Go", "Drop"]

# 대안이 "그것으로 충분하다"로 읽히는 표현.
#
# ⚠️ 이 정규식만으로는 **Drop 을 내지 않는다.** Drop 판정의 근거는 LLM 이 명시한 alt_sufficient 뿐이다.
#    이유: LLM 은 "일부는 가능하다. 그러나 전체를 대체하지는 못한다" 처럼 쓰는데, 앞 절만 보면
#    "가능하다" 로 읽혀 오탐이 난다. 실제로 엉뚱한 Drop 이 발생했다.
#    잘못된 Drop 은 필요한 개발을 죽이므로 잘못된 Conditional Go 보다 훨씬 해롭다.
#    → 정규식 탐지는 "확인해 보라"는 **조건부 신호**로만 쓴다.
_ALT_ENOUGH = re.compile(
    r"(충분(하|합|할|히)|가능(하다|합니다|할 것|해 보인다)|해결(된다|됩니다|할 수 있)"
    r"|대체(할 수 있|가능)|불필요(하다|합니다))")
_ALT_NOT = re.compile(
    r"(불가능|어렵|곤란|힘들|안 된다|안 됩니다|못한다|못함|못하|없다|없음|없으"
    r"|충분하지|부족|한계|불충분|미흡|제한|해결되지|대체하지|충족하지"
    r"|그러나|다만|반면|하지만|남는다|남아|별도)")
_NEED_CHECK = re.compile(r"(확인\s*필요|미확인|확인해야|확인이 필요|검증이 필요|검증해야)")

ALT_LABEL = {
    "alt_process": "프로세스/규정 개선",
    "alt_system": "기존 시스템 기능/설정",
    "alt_macro": "매크로/엑셀",
    "alt_llm": "단순 LLM 챗(가이드 배포)",
}


def _alt_is_enough(text: str) -> bool:
    """이 대안 하나로 충분하다고 적혀 있는가. 부정 표현이 함께 있으면 아니다."""
    t = str(text or "")
    if not t.strip():
        return False
    if _ALT_NOT.search(t):
        return False
    return bool(_ALT_ENOUGH.search(t))


def recommend_verdict(tr: dict, ty: dict, au: dict, roi: dict, fit: dict,
                      alts: dict, alt_sufficient: dict | None = None,
                      assess: dict | None = None) -> dict:
    """Go / Conditional Go / Drop **권고**와 상세 근거.

    ★ 이것은 **권고이지 판정이 아니다.** 확정은 담당자와 팀장이 G1 에서 한다 (금칙 G-2).
      문서 5번의 확정란은 비워 두고, 이 권고는 "참고" 라고 명시해 함께 싣는다.

    판정 규칙 (결정적 — LLM 이 흔들 수 없다)
      Drop            : 값싼 대안이 충분하다고 적혔거나, 반복성·볼륨이 '하'
      Conditional Go  : 규칙 문서화 '하' / 오류 허용도 '하' / 데이터 접근성 '하' /
                        정치적 이슈 '하' / ROI 미산출 / 대안 배제 미완료 / 자율성·트랙 모순 /
                        평가서 필수 항목 미확보
      Go              : 위 신호 없음
    """
    fit = fit or {}
    alts = alts or {}
    reasons = []          # 근거표 행: (구분, 확인 내용, 영향, 근거 조항)
    drop_sig, cond_sig, good = [], [], []

    def add(area, finding, effect, cite):
        reasons.append({"area": area, "finding": finding, "effect": effect, "cite": cite})

    def grade(k):
        return ((fit.get(k) or {}).get("grade") or "").strip()

    # ── 1. 대안 검토 — 값싼 해법이 있으면 만들지 않는다 (표준체계 문서② 작성 안내) ──
    #     Drop 은 LLM 이 명시적으로 확인한 것만. 정규식 추정은 "확인해 보라"는 조건부 신호로만 쓴다.
    sufficient, maybe = [], []
    for key, label in ALT_LABEL.items():
        by_llm = (alt_sufficient or {}).get(key.replace("alt_", ""))
        if isinstance(by_llm, bool):
            if by_llm:
                sufficient.append(label)
        elif _alt_is_enough(alts.get(key) or ""):
            maybe.append(label)
    if sufficient:
        drop_sig.append("alt_enough")
        add("대안 검토", f"“{', '.join(sufficient)}” 만으로 요구가 해결된다고 확인되었습니다",
            "**Drop**", CITE["fea.purpose"])
    if maybe:
        cond_sig.append("alt_maybe")
        add("대안 검토", f"“{', '.join(maybe)}” 이(가) 충분하다는 뜻으로 읽히는 서술이 있습니다 — "
                       "사실이라면 에이전트를 만들 이유가 없으므로 먼저 확인해야 합니다",
            "**조건부**", CITE["fea.purpose"])

    pending = [ALT_LABEL[k] for k in ALT_LABEL
               if _NEED_CHECK.search(str(alts.get(k) or ""))]
    if pending:
        cond_sig.append("alt_pending")
        add("대안 검토", f"“{', '.join(pending)}” 의 검토가 ‘확인 필요’ 로 남아 있습니다 — "
                       "값싼 해법의 배제가 끝나지 않았습니다",
            "**조건부**", CITE["fea.alt"])
    empty_alts = [ALT_LABEL[k] for k in ALT_LABEL if not str(alts.get(k) or "").strip()]
    if empty_alts:
        cond_sig.append("alt_empty")
        add("대안 검토", f"“{', '.join(empty_alts)}” 항목이 비어 있습니다",
            "**조건부**", CITE["gate.g1"])
    if not sufficient and not maybe and not pending and not empty_alts:
        good.append("대안 4항목이 모두 근거와 함께 배제되었습니다")

    # ── 2. 조건부 Go 신호 ──
    # v4.0 문서② 에서 「적합성 진단 5축」 은 근거를 잃었다. 남은 것은 하나 —
    # "규칙(로직) 문서화가 어려우면 조건부 Go를 검토한다".
    if grade("rule_doc") == "하":
        cond_sig.append("rule_doc")
        add("규칙 문서화", "판단 규칙을 글로 적을 수 없습니다 — 규정·기준이 담당자 머릿속에만 있습니다",
            "**조건부**", CITE["fea.rule_doc"])
    elif grade("rule_doc") == "상":
        good.append("판단 규칙이 문서로 존재합니다")

    # ── 3. 기대 효과 ──
    # v4.0 은 정밀한 수치도 금액 환산도 요구하지 않는다. 수치가 없다는 이유로
    # 판정을 깎지 않는다 — 계산되면 근거로 얹고, 안 되면 아무것도 하지 않는다.
    if (roi or {}).get("computed"):
        good.append(f"절감 {_n(roi['saved_hours_month'])}시간/월 "
                    f"(연 {_n(roi['saved_hours_year'])}시간 · 약 {_n(roi['saved_md_year'])} M/D)")

    # ── 4. 트랙·유형·자율성 ──
    if not (au or {}).get("consistent"):
        cond_sig.append("autonomy")
        add("자율성", (au or {}).get("message") or "자율성과 트랙이 모순됩니다",
            "**조건부**", CITE["track.autonomy_table"])
    if (tr or {}).get("track") == "상":
        add("트랙", f"상 트랙입니다 — 필수 문서 {TRACK_DOCS['상']}, "
                   f"승인 주체 {TRACK_APPROVER['상']}, 배포는 {TRACK_PILOT['상']}",
            "유의", CITE["track.docs"])

    # ── 5. 평가서 자체의 완성도 ──
    miss = list((assess or {}).get("missing") or []) + list((assess or {}).get("weak") or [])
    if miss:
        cond_sig.append("form")
        labels = [((assess or {}).get("slots") or {}).get(k, {}).get("label", k) for k in miss[:5]]
        add("평가서 완성도", f"미확보·보완 필요 항목 {len(miss)}개 ({', '.join(labels)}"
                          + (" 외" if len(miss) > 5 else "") + ")",
            "**조건부**", CITE["gate.g1"])

    # ── 6. 종합 판정 ──
    if drop_sig:
        verdict = "Drop"
    elif cond_sig:
        verdict = "Conditional Go"
    else:
        verdict = "Go"

    # 확신도 — "이 권고를 얼마나 믿어도 되는가".
    # Drop 인데 평가서가 덜 채워졌으면(cond_sig 존재) 잠정으로 본다. 단정하면 안 되는 상황이다.
    if verdict == "Drop":
        confidence = "높음" if len(drop_sig) >= 2 else ("보통" if not cond_sig else "낮음")
    elif verdict == "Conditional Go":
        confidence = "높음" if len(cond_sig) == 1 else ("보통" if len(cond_sig) <= 3 else "낮음")
    else:
        confidence = "높음"

    # ── 7. 조건 / 대안 ──
    conditions, alternatives = [], ""
    if verdict == "Conditional Go":
        cmap = {
            "alt_maybe": "대안이 충분하다는 뜻으로 읽히는 서술을 확인할 것 — 사실이면 Drop, 아니면 문장을 명확히 고칠 것",
            "alt_pending": "대안 검토에서 ‘확인 필요’ 로 남은 항목을 실제로 확인해 배제 기록을 마무리할 것",
            "alt_empty": "비어 있는 대안 검토 항목을 채울 것 — G1 통과 조건에 ‘대안 검토 기록’ 이 있음",
            "rule_doc": "판단 규칙(규정·기준)을 먼저 문서로 확정한 뒤 재평가할 것",
            "error_tolerance": "사람이 검토하는 지점(Human-in-the-loop)을 설계에 넣거나 자율성 수준을 낮출 것",
            "data_access": "필요 데이터의 접근 수단(API·파일·권한)을 확인할 것",
            "politics": "관련 부서 이해관계를 오너가 먼저 조율할 것",
            "roi": "INT 2번의 정량 수치(건수/월·시간/건·인원)를 확보한 뒤 ROI 를 재산출할 것",
            "autonomy": "자율성 수준과 트랙의 모순을 해소할 것 — L2 이상은 상 트랙 재심사 대상",
            "form": "평가서의 미확보·보완 필요 항목을 채울 것",
        }
        seen = set()
        for s in cond_sig:
            if s in cmap and s not in seen:
                seen.add(s)
                conditions.append(cmap[s])
    elif verdict == "Drop":
        alternatives = "; ".join([
            "값싼 해법부터 다시 검토 — 프로세스/규정 개선 → 기존 시스템 기능 → 매크로/엑셀 → 단순 LLM 챗 가이드",
            ("충분하다고 판단된 대안(" + ", ".join(sufficient) + ")을 먼저 실행할 것" if sufficient else
             "자동화 가치가 확보되는 수준으로 업무량이 늘어나면 재접수할 것"),
            f"Drop 판정 시 사유와 대안을 Drop 대장에 기록합니다. [{CITE['fea.drop']}]",
        ])

    # ── 8. 문장 — **무엇 때문에 이 판정인지**를 먼저 말한다 ──
    #     표준체계 철학을 읊는 대신 실제 근거를 앞에 둔다. 인용은 근거표에 있다.
    if verdict == "Drop":
        why = []
        if sufficient:
            why.append(f"**「{', '.join(sufficient)}」 만으로 요구가 해결된다**고 확인되었습니다. "
                       "더 값싼 해법이 있으면 에이전트를 만들지 않는 것이 표준체계 문서②의 원칙입니다")
        if "volume" in drop_sig:
            why.append("**반복성·볼륨이 ‘하’** 입니다 — 자동화 가치가 낮아 개발 비용을 회수하기 어렵습니다")
        head = "에이전트 개발을 **권고하지 않습니다.** " + ". ".join(why) + "."
    elif verdict == "Conditional Go":
        first = reasons[0]["finding"] if reasons else ""
        head = ("지금 상태로는 **조건을 붙여야** 합니다."
                + (f"\n\n가장 큰 이유 — {first}" if first else "")
                + "\n\n아래 조건이 해소되기 전에는 개발 착수를 권고하지 않습니다.")
    else:
        head = ("에이전트 개발을 **진행할 만하다**고 봅니다. "
                + ("걸림돌로 볼 신호가 확인되지 않았습니다"
                   + (f" — {good[0]}" if good else "") + "."))

    if confidence == "낮음":
        head += ("\n\n⚠️ **이 권고는 잠정입니다.** 평가서에 아직 확인·보완이 필요한 항목이 남아 있어 "
                 "판단 근거가 충분하지 않습니다. 남은 항목을 채우면 권고가 달라질 수 있습니다.")

    lines = [f"**▶ 에이전트 권고: {verdict}** (확신도 {confidence}) — **참고용입니다.** "
             f"최종 판정은 담당자와 팀장이 G1 에서 확정합니다. [{CITE['gate.g1']}]", "", head, ""]
    if good:
        lines.append("**긍정 근거**")
        lines += [f"- {g}" for g in good]
        lines.append("")
    # 항목별 검토 결과는 위 "권고 근거" 표에 있으므로 여기서 반복하지 않는다.
    if conditions:
        lines.append("**해소해야 할 조건**")
        lines += [f"{i}. {c}" for i, c in enumerate(conditions, 1)]
        lines.append("")
    lines.append(f"- 트랙: **{tr.get('track', '?')}** — {tr.get('reason', '')}")
    lines.append(f"- 유형: **{ty.get('type', '?')}** — {ty.get('reason', '')}")
    lines.append(f"- 품질 확인 방법: {ty.get('quality_rule', '')} [{CITE['type.quality']}]")
    lines.append(f"- 필수 문서: {tr.get('required_docs', '')} [{CITE['track.docs']}]")
    lines.append(f"- 승인 주체: {tr.get('approver', '')} · 배포: {tr.get('pilot', '')}")

    return {
        "verdict": verdict, "confidence": confidence, "headline": head,
        "reasons": reasons, "good": good, "conditions": conditions,
        "alternatives": alternatives,
        "signals": {"drop": drop_sig, "conditional": cond_sig},
        "sufficient_alternatives": sufficient,
        "text": "\n".join(lines),
        "cite": CITE["gate.g1"],
    }


def verdict_checkbox(verdict: str) -> str:
    """표준체계 문서② 5번 양식의 3지선다. **에이전트는 체크하지 않는다** (금칙 G-2).

    권고한 항목만 표시해 두고, 실제 체크는 담당자·팀장이 한다.
    """
    mark = {v: ("◀ 에이전트 권고" if v == verdict else "") for v in VERDICTS}
    return "\n".join([
        f"☐ Go (트랙: ______, 목표 일정: ______)   {mark['Go']}",
        f"☐ Conditional Go (조건: ______)   {mark['Conditional Go']}",
        f"☐ Drop (사유 + 대안 안내: ______)   {mark['Drop']}",
        "",
        "※ 위 체크란은 **담당자·팀장이 G1 에서 확정**합니다. 에이전트는 체크하지 않습니다.",
    ])

