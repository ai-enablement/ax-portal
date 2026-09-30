export function normalizeContactEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isContactEmail(value) {
  const email = normalizeContactEmail(value);
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email);
}

export function emailFromPartyLabel(label) {
  return normalizeContactEmail(String(label || '').split('·').find(part => part.includes('@')));
}

export function historicalParties(state) {
  const name=value=>/^(미등록|미지정|없음|-)?$/.test(String(value||'').trim())?'':String(value).split('·')[0].trim();
  const fallbackEmail=normalizeContactEmail(state.projectOwnerEmail)||emailFromPartyLabel(state.projectOwner||state.owner);
  const names=String(state.projectOwner||state.owner||'').split(/[\/;\n]|\s+·\s+/).filter(v=>!v.includes('@')).map(name).filter(Boolean);
  return {
    requester:{name:name(state.requester),email:normalizeContactEmail(state.requesterEmail)||emailFromPartyLabel(state.requester)},
    owners:Array.isArray(state.projectOwners)&&state.projectOwners.length?state.projectOwners.map(p=>({...p,name:name(p.name),email:normalizeContactEmail(p.email)})):
      (names.length?names:['']).map((v,i)=>({name:v,email:i===0?fallbackEmail:''})),
  };
}
