import { WakeListener } from './wake.js';
const node = (tag, text) => { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; };
export function assistantExtras({ api, onWake, canListen, notify }) {
  const panel = node('section'); panel.className = 'panel';
  const heading = node('h2', 'VOICE & REMINDERS'), wakeButton = node('button', 'Enable “Hey Kane”'), wakeStatus = node('p', 'Wake word off');
  wakeButton.className = 'outline full'; wakeButton.id = 'wake-toggle'; wakeStatus.className = 'fine'; wakeStatus.id = 'wake-status'; wakeStatus.setAttribute('role', 'status');
  const privacy = node('p', 'Opt-in browser recognition may send audio to your browser provider. Keep Kane visible. Listening pauses during replies; Stop disables it.'); privacy.className = 'fine';
  const wake = new WakeListener(onWake, text => { wakeStatus.textContent = text; wakeButton.textContent = wake.enabled ? 'Disable wake word' : 'Enable “Hey Kane”'; });
  wakeButton.disabled = !wake.Recognition;
  if (!wake.Recognition) wakeStatus.textContent = 'Browser wake recognition unavailable; use the microphone.';
  wakeButton.onclick = () => { if (wake.enabled) wake.disable(); else if (confirm('Enable wake-word listening? Chrome may send microphone audio to its speech service. Kane must stay open and visible. You can disable it at any time.')) { try { wake.enable(); if (document.hidden || !canListen()) wake.pause(); } catch (error) { notify(error); } } };
  const notificationButton = node('button', 'Enable reminder notifications'); notificationButton.className = 'quiet full'; notificationButton.id = 'reminder-notifications';
  notificationButton.onclick = async () => { if (!('Notification' in window)) return notify(new Error('Browser notifications are unavailable. Reminders still appear here.')); const permission = await Notification.requestPermission(); notificationButton.textContent = permission === 'granted' ? 'Notifications enabled' : 'Notifications blocked · use cockpit alerts'; if (permission === 'granted') { alerts.clear(); await refresh(); } };
  const form = node('form'); form.id = 'reminder-form'; form.className = 'reminder-form';
  const title = node('input'); title.placeholder = 'What should Kane remind you?'; title.setAttribute('aria-label', 'Reminder title'); title.required = true; title.maxLength = 500; title.id = 'reminder-title';
  const due = node('input'); due.type = 'datetime-local'; due.required = true; due.setAttribute('aria-label', 'Reminder date and time in your local timezone'); due.id = 'reminder-time';
  const repeat = node('select'); repeat.setAttribute('aria-label', 'Reminder repetition'); for (const [value, label] of [[0,'Once'],[24,'Every 24 hours'],[168,'Every 7 days']]) { const option = node('option',label); option.value = value; repeat.append(option); }
  const save = node('button', 'Save reminder'); save.className = 'outline full'; form.append(title, due, repeat, save);
  const focus = node('button', 'Start 25-minute focus timer'); focus.className = 'quiet full'; focus.id = 'focus-timer';
  const status = node('p', 'Delivery requires Kane’s server and an open browser tab. Missed reminders remain overdue.'); status.className = 'fine'; status.id = 'reminder-status';
  const list = node('div'); list.id = 'reminders'; list.setAttribute('aria-live', 'polite');
  panel.append(heading, wakeButton, wakeStatus, privacy, notificationButton, form, focus, status, list); document.querySelector('.right-rail').prepend(panel);
  const alerts = new Set(); let polling = false;
  async function refresh() {
    if (polling) return; polling = true;
    try {
      const result = await api('/api/reminders'); const now = Date.parse(result.serverTime); list.replaceChildren();
      if (!result.reminders.length) list.append(node('p', 'No upcoming reminders.'));
      for (const reminder of result.reminders) {
        const overdue = Date.parse(reminder.due_at) <= now, row = node('div'); row.className = 'reminder-row' + (overdue ? ' reminder-due' : '');
        row.append(node('strong', reminder.title), node('p', (overdue ? 'DUE · ' : '') + new Date(reminder.due_at).toLocaleString()));
        for (const [label, action] of [['Snooze 10 min','snooze'],[reminder.repeat_hours ? 'Done · next occurrence' : 'Dismiss','dismiss'],['Delete','delete']]) { const button = node('button',label); button.className = 'quiet'; button.onclick = async () => { try { await api('/api/reminders/' + reminder.id, action === 'delete' ? 'DELETE' : 'PATCH', action === 'delete' ? undefined : { action }); await refresh(); } catch (error) { notify(error); } }; row.append(button); }
        list.append(row);
        const key = reminder.id + ':' + reminder.due_at;
        if (overdue && !alerts.has(key)) {
          alerts.add(key);
          if ('Notification' in window && Notification.permission === 'granted') {
            try { const registration = await navigator.serviceWorker?.getRegistration(); if (registration) await registration.showNotification('Kane reminder', { body: reminder.title, tag: key, icon: '/icon.svg' }); else new Notification('Kane reminder', { body: reminder.title, tag: key }); }
            catch { status.textContent = 'Browser notification failed. Due reminders are shown below.'; alerts.delete(key); }
          }
        }
      }
    } catch (error) { status.textContent = 'Reminders unavailable: ' + error.message; }
    finally { polling = false; }
  }
  form.onsubmit = async event => { event.preventDefault(); try { const timestamp = new Date(due.value); if (!Number.isFinite(timestamp.getTime())) throw new Error('Choose a valid date and time.'); await api('/api/reminders','POST',{ title: title.value, dueAt: timestamp.toISOString(), repeatHours: Number(repeat.value) }); form.reset(); await refresh(); } catch (error) { notify(error); } };
  focus.onclick = async () => { try { await api('/api/reminders','POST',{ title: 'Focus session complete — take a short break', dueAt: new Date(Date.now() + 25 * 60000).toISOString() }); await refresh(); } catch (error) { notify(error); } };
  const timer = setInterval(() => { if (wake.enabled) { if (document.hidden || !canListen()) { if (!wake.paused) wake.pause(); } else if (wake.paused) wake.resume(); } }, 500);
  const poll = setInterval(refresh, 10000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) wake.pause(); else refresh(); });
  window.addEventListener('pagehide', () => { wake.disable(); clearInterval(timer); clearInterval(poll); });
  refresh();
  return { wake, refresh };
}
