const $ = id => document.getElementById(id);
let device = localStorage.getItem('kane-phone');
async function api(path, method = 'GET', body) { const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }
function status(value) { $('phone-status').textContent = value; }
$('phone-login').onsubmit = async event => { event.preventDefault(); try { await api('/api/auth/login', 'POST', { password: $('phone-password').value }); $('phone-password').value = ''; status('Signed in. Enter your pairing code.'); } catch (error) { status(error.message); } };
$('phone-pair').onsubmit = async event => { event.preventDefault(); try { const result = await api('/api/phone/pair', 'POST', { code: $('phone-code').value, name: $('phone-name').value }); device = result.id; localStorage.setItem('kane-phone', device); $('phone-code').value = ''; status('Paired. Waiting for approved requests.'); await poll(); } catch (error) { status(error.message); } };
$('phone-unpair').onclick = async () => { if (!device || !confirm('Revoke this device?')) return; try { await api('/api/phone/devices/' + device, 'DELETE'); localStorage.removeItem('kane-phone'); device = undefined; $('phone-actions').replaceChildren(); status('Access revoked.'); } catch (error) { status(error.message); } };
async function poll() {
  if (!device || document.hidden) return;
  try {
    const result = await api('/api/phone/devices/' + device + '/poll'); $('phone-actions').replaceChildren(); status('Paired · companion active');
    result.actions.forEach(action => {
      let destination;
      if (action.kind === 'open_url') { const url = new URL(action.argument); if (url.protocol !== 'https:') return; destination = url.href; }
      else if (action.kind === 'dial_number' && /^\+?[0-9]{5,15}$/.test(action.argument)) destination = 'tel:' + action.argument;
      else if (action.kind === 'draft_sms') { const draft = JSON.parse(action.argument); if (!/^\+?[0-9]{5,15}$/.test(draft.number)) return; destination = 'sms:' + draft.number + '?body=' + encodeURIComponent(draft.text); }
      else return;
      const row = document.createElement('div'), text = document.createElement('p'), open = document.createElement('button');
      text.textContent = 'Approved ' + action.kind + ': ' + action.argument; text.className = 'fine'; open.textContent = action.kind === 'open_url' ? 'Open this link' : action.kind === 'dial_number' ? 'Open phone dialer' : 'Open SMS draft'; open.className = 'outline';
      open.onclick = async () => {
        // Preserve the phone user's gesture for popup permission, acknowledge once before navigation.
        const tab = window.open('about:blank', '_blank');
        try { await api('/api/phone/actions/' + action.id + '/acknowledge', 'POST', { deviceId: device }); if (tab) { tab.opener = null; tab.location = destination; } else location.assign(destination); await poll(); }
        catch (error) { tab?.close(); status(error.message); }
      };
      row.append(text, open); $('phone-actions').append(row);
    });
  } catch (error) { status(error.message); }
}
setInterval(poll, 5000); poll();
