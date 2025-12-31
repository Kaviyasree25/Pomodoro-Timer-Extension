// Pomodoro Timer Background Service Worker
class PomodoroTimer {
  constructor() {
    this.state = {
      isRunning: false,
      isBreak: false,
      timeRemaining: 25 * 60, // 25 minutes in seconds
      workDuration: 25 * 60,
      shortBreakDuration: 5 * 60,
      longBreakDuration: 15 * 60,
      completedPomodoros: 0,
      taskChecklist: [],
      startTime: null
    };
    this.stats = {
      totalFocusTime: 0,
      totalPomodoros: 0,
      dailyPomodoros: 0,
      lastResetDate: new Date().toDateString()
    };
    this.init();
  }

  async init() {
    await this.loadState();
    await this.loadStats();
    this.setupAlarms();
    this.checkDailyReset();
  }

  async loadState() {
    const data = await chrome.storage.local.get('pomodoroState');
    if (data.pomodoroState) {
      this.state = { ...this.state, ...data.pomodoroState };
    }
  }

  async loadStats() {
    const data = await chrome.storage.local.get('pomodoroStats');
    if (data.pomodoroStats) {
      this.stats = { ...this.stats, ...data.pomodoroStats };
    }
  }

  async saveState() {
    await chrome.storage.local.set({ pomodoroState: this.state });
  }

  async saveStats() {
    await chrome.storage.local.set({ pomodoroStats: this.stats });
  }

  setupAlarms() {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'pomodoro-tick') {
        await this.tick();
      } else if (alarm.name === 'pomodoro-complete') {
        await this.completeSession();
      }
    });
  }

  checkDailyReset() {
    const today = new Date().toDateString();
    if (this.stats.lastResetDate !== today) {
      this.stats.dailyPomodoros = 0;
      this.stats.lastResetDate = today;
      this.saveStats();
    }
  }

  async start() {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isBreak = false;
    this.state.startTime = Date.now();
    this.state.timeRemaining = this.state.workDuration;

    await this.saveState();
    this.updateBadge();
    this.startTicking();
  }

  async startBreak(isLongBreak = false) {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isBreak = true;
    this.state.timeRemaining = isLongBreak 
      ? this.state.longBreakDuration 
      : this.state.shortBreakDuration;
    this.state.startTime = Date.now();

    await this.saveState();
    this.updateBadge();
    this.startTicking();
  }

  async pause() {
    if (!this.state.isRunning) return;

    this.state.isRunning = false;
    await this.saveState();
    this.stopTicking();
    this.updateBadge();
  }

  async resume() {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.startTime = Date.now() - (this.state.workDuration - this.state.timeRemaining) * 1000;
    await this.saveState();
    this.startTicking();
    this.updateBadge();
  }

  async stop() {
    this.state.isRunning = false;
    this.state.timeRemaining = this.state.workDuration;
    this.state.startTime = null;
    await this.saveState();
    this.stopTicking();
    this.updateBadge();
  }

  async reset() {
    await this.stop();
    this.state.completedPomodoros = 0;
    await this.saveState();
  }

  startTicking() {
    chrome.alarms.create('pomodoro-tick', { periodInMinutes: 1 / 60 }); // Every second
    chrome.alarms.create('pomodoro-complete', { when: Date.now() + this.state.timeRemaining * 1000 });
  }

  stopTicking() {
    chrome.alarms.clear('pomodoro-tick');
    chrome.alarms.clear('pomodoro-complete');
  }

  async tick() {
    if (!this.state.isRunning) return;

    const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
    this.state.timeRemaining = Math.max(0, (this.state.isBreak ? 
      (this.state.timeRemaining - elapsed) : 
      (this.state.workDuration - elapsed)));

    if (this.state.timeRemaining <= 0) {
      await this.completeSession();
    } else {
      await this.saveState();
      this.updateBadge();
    }
  }

  async completeSession() {
    this.state.isRunning = false;
    this.stopTicking();

    if (!this.state.isBreak) {
      // Completed a work session
      this.state.completedPomodoros++;
      this.stats.totalPomodoros++;
      this.stats.dailyPomodoros++;
      this.stats.totalFocusTime += this.state.workDuration;
      
      await this.saveStats();
      
      // Show completion notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Pomodoro Complete! 🎉',
        message: `Great work! ${this.state.completedPomodoros} pomodoros completed today. Time for a break!`
      });

      // Auto-start break after 5 seconds
      setTimeout(() => {
        const isLongBreak = this.state.completedPomodoros % 4 === 0;
        this.startBreak(isLongBreak);
      }, 5000);
    } else {
      // Break completed
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Break Complete',
        message: 'Ready to get back to work?'
      });
    }

    await this.saveState();
    this.updateBadge();
  }

  updateBadge() {
    if (!this.state.isRunning) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const minutes = Math.ceil(this.state.timeRemaining / 60);
    chrome.action.setBadgeText({ text: minutes.toString() });
    chrome.action.setBadgeBackgroundColor({ 
      color: this.state.isBreak ? '#3498db' : '#e74c3c' 
    });
  }

  getState() {
    return {
      ...this.state,
      minutes: Math.floor(this.state.timeRemaining / 60),
      seconds: this.state.timeRemaining % 60,
      progress: this.state.isBreak 
        ? ((this.state.timeRemaining / this.state.shortBreakDuration) * 100)
        : ((this.state.timeRemaining / this.state.workDuration) * 100)
    };
  }

  getStats() {
    return {
      ...this.stats,
      totalFocusHours: Math.floor(this.stats.totalFocusTime / 3600),
      totalFocusMinutes: Math.floor((this.stats.totalFocusTime % 3600) / 60)
    };
  }

  async updateSettings(settings) {
    if (settings.workDuration) {
      this.state.workDuration = settings.workDuration * 60;
    }
    if (settings.shortBreakDuration) {
      this.state.shortBreakDuration = settings.shortBreakDuration * 60;
    }
    if (settings.longBreakDuration) {
      this.state.longBreakDuration = settings.longBreakDuration * 60;
    }
    await this.saveState();
  }
}

// Initialize timer
const pomodoro = new PomodoroTimer();

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'start':
          await pomodoro.start();
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        case 'startBreak':
          await pomodoro.startBreak(message.isLongBreak);
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        case 'pause':
          await pomodoro.pause();
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        case 'resume':
          await pomodoro.resume();
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        case 'stop':
          await pomodoro.stop();
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        case 'reset':
          await pomodoro.reset();
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        case 'getState':
          sendResponse({ state: pomodoro.getState() });
          break;
        
        case 'getStats':
          sendResponse({ stats: pomodoro.getStats() });
          break;
        
        case 'updateSettings':
          await pomodoro.updateSettings(message.settings);
          sendResponse({ success: true });
          break;
        
        case 'updateChecklist':
          pomodoro.state.taskChecklist = message.checklist || [];
          await pomodoro.saveState();
          sendResponse({ success: true, state: pomodoro.getState() });
          break;
        
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  })();
  return true;
});

// Update badge periodically
setInterval(() => {
  pomodoro.updateBadge();
}, 1000);

