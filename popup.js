// Popup script for Pomodoro Timer
document.addEventListener('DOMContentLoaded', async () => {
  const timerMinutes = document.getElementById('timer-minutes');
  const timerSeconds = document.getElementById('timer-seconds');
  const timerStatus = document.getElementById('timer-status');
  const progressCircle = document.getElementById('progress-circle');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const shortBreakBtn = document.getElementById('short-break-btn');
  const longBreakBtn = document.getElementById('long-break-btn');
  const taskInput = document.getElementById('task-input');
  const addTaskBtn = document.getElementById('add-task-btn');
  const taskChecklistEl = document.getElementById('task-checklist');
  const dailyPomodorosEl = document.getElementById('daily-pomodoros');
  const totalPomodorosEl = document.getElementById('total-pomodoros');
  const focusTimeEl = document.getElementById('focus-time');
  const workDurationInput = document.getElementById('work-duration');
  const shortBreakDurationInput = document.getElementById('short-break-duration');
  const longBreakDurationInput = document.getElementById('long-break-duration');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const themeToggle = document.getElementById('theme-toggle');

  let currentState = null;
  let updateInterval = null;

  // Load and apply theme
  async function loadTheme() {
    try {
      const result = await chrome.storage.local.get('pomodoroTheme');
      const isDarkMode = result.pomodoroTheme === 'dark';
      themeToggle.checked = isDarkMode;
      applyTheme(isDarkMode);
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  }

  function applyTheme(isDarkMode) {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  // Theme toggle handler
  themeToggle.addEventListener('change', async (e) => {
    const isDarkMode = e.target.checked;
    applyTheme(isDarkMode);
    await chrome.storage.local.set({ pomodoroTheme: isDarkMode ? 'dark' : 'light' });
  });

  // Load state and stats
  async function loadState() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getState' });
      currentState = response.state;
      updateDisplay();
    } catch (error) {
      console.error('Error loading state:', error);
    }
  }

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      const stats = response.stats || {};
      
      dailyPomodorosEl.textContent = stats.dailyPomodoros || 0;
      totalPomodorosEl.textContent = stats.totalPomodoros || 0;
      focusTimeEl.textContent = `${stats.totalFocusHours || 0}h`;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  function updateDisplay() {
    if (!currentState) return;

    const minutes = String(Math.floor(currentState.timeRemaining / 60)).padStart(2, '0');
    const seconds = String(currentState.timeRemaining % 60).padStart(2, '0');

    timerMinutes.textContent = minutes;
    timerSeconds.textContent = seconds;

    // Update progress circle
    const circumference = 2 * Math.PI * 90;
    const progress = currentState.progress || 0;
    const offset = circumference - (progress / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;

    // Update status
    if (currentState.isRunning) {
      timerStatus.textContent = currentState.isBreak ? 'On Break' : 'Focusing';
      timerStatus.style.color = currentState.isBreak ? '#3498db' : '#ff6b6b';
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
    } else {
      timerStatus.textContent = currentState.isBreak ? 'Break Paused' : 'Ready to focus';
      timerStatus.style.color = '#666';
      startBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
    }

    // Update task checklist
    updateChecklist(currentState.taskChecklist || []);
  }

  // Add task to checklist
  function addTask() {
    const taskText = taskInput.value.trim();
    if (!taskText) return;

    const checklist = currentState?.taskChecklist || [];
    checklist.push({
      id: Date.now().toString(),
      text: taskText,
      completed: false
    });

    chrome.runtime.sendMessage({
      action: 'updateChecklist',
      checklist
    }, () => {
      loadState();
    });

    taskInput.value = '';
  }

  addTaskBtn.addEventListener('click', addTask);
  taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addTask();
    }
  });

  // Toggle task completion
  function toggleTask(taskId) {
    const checklist = currentState?.taskChecklist || [];
    const task = checklist.find(t => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      chrome.runtime.sendMessage({
        action: 'updateChecklist',
        checklist
      }, () => {
        loadState();
      });
    }
  }

  // Delete task
  function deleteTask(taskId) {
    const checklist = currentState?.taskChecklist || [];
    const filtered = checklist.filter(t => t.id !== taskId);
    chrome.runtime.sendMessage({
      action: 'updateChecklist',
      checklist: filtered
    }, () => {
      loadState();
    });
  }

  // Update checklist display
  function updateChecklist(checklist) {
    if (!checklist || checklist.length === 0) {
      taskChecklistEl.innerHTML = '<div class="empty-checklist">No tasks yet. Add one above!</div>';
      return;
    }

    taskChecklistEl.innerHTML = checklist.map(task => `
      <div class="task-item ${task.completed ? 'completed' : ''}">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
               data-task-id="${task.id}">
        <span class="task-text">${escapeHtml(task.text)}</span>
        <button class="task-delete" data-task-id="${task.id}" title="Delete">×</button>
      </div>
    `).join('');

    // Attach event listeners
    taskChecklistEl.querySelectorAll('.task-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        toggleTask(checkbox.dataset.taskId);
      });
    });

    taskChecklistEl.querySelectorAll('.task-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteTask(btn.dataset.taskId);
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Start timer
  startBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'start' });
    await loadState();
    startUpdateInterval();
  });

  // Pause timer
  pauseBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'pause' });
    await loadState();
    stopUpdateInterval();
  });

  // Stop timer
  stopBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'stop' });
    await loadState();
    loadStats();
    stopUpdateInterval();
  });

  // Short break
  shortBreakBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'startBreak', isLongBreak: false });
    await loadState();
    startUpdateInterval();
  });

  // Long break
  longBreakBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'startBreak', isLongBreak: true });
    await loadState();
    startUpdateInterval();
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: {
        workDuration: parseInt(workDurationInput.value),
        shortBreakDuration: parseInt(shortBreakDurationInput.value),
        longBreakDuration: parseInt(longBreakDurationInput.value)
      }
    });
    
    alert('Settings saved!');
    await loadState();
  });

  function startUpdateInterval() {
    stopUpdateInterval();
    updateInterval = setInterval(async () => {
      await loadState();
      await loadStats();
    }, 1000);
  }

  function stopUpdateInterval() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  // Collapsible sections functionality
  const statsHeader = document.getElementById('stats-header');
  const statsContent = document.getElementById('stats-content');
  const statsSection = statsHeader.closest('.collapsible-section');
  const customizationHeader = document.getElementById('customization-header');
  const customizationContent = document.getElementById('customization-content');
  const customizationSection = customizationHeader.closest('.collapsible-section');

  // Load collapsed/expanded state
  async function loadSectionStates() {
    try {
      const result = await chrome.storage.local.get(['statsExpanded', 'customizationExpanded']);
      if (result.statsExpanded !== undefined) {
        if (result.statsExpanded) {
          statsSection.classList.add('expanded');
        } else {
          statsSection.classList.remove('expanded');
        }
      } else {
        // Default: collapsed
        statsSection.classList.remove('expanded');
      }
      
      if (result.customizationExpanded !== undefined) {
        if (result.customizationExpanded) {
          customizationSection.classList.add('expanded');
        } else {
          customizationSection.classList.remove('expanded');
        }
      } else {
        // Default: collapsed
        customizationSection.classList.remove('expanded');
      }
    } catch (error) {
      console.error('Error loading section states:', error);
    }
  }

  // Toggle stats section
  statsHeader.addEventListener('click', async () => {
    const isExpanded = statsSection.classList.contains('expanded');
    if (isExpanded) {
      statsSection.classList.remove('expanded');
      await chrome.storage.local.set({ statsExpanded: false });
    } else {
      statsSection.classList.add('expanded');
      await chrome.storage.local.set({ statsExpanded: true });
    }
  });

  // Toggle customization section
  customizationHeader.addEventListener('click', async () => {
    const isExpanded = customizationSection.classList.contains('expanded');
    if (isExpanded) {
      customizationSection.classList.remove('expanded');
      await chrome.storage.local.set({ customizationExpanded: false });
    } else {
      customizationSection.classList.add('expanded');
      await chrome.storage.local.set({ customizationExpanded: true });
    }
  });

  // Initial load
  await loadTheme();
  await loadSectionStates();
  await loadState();
  await loadStats();
  
  // Start update interval if timer is running
  if (currentState && currentState.isRunning) {
    startUpdateInterval();
  }

});

