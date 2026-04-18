/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Clock as ClockIcon, 
  Volume2, 
  VolumeX, 
  Settings2, 
  AlarmClock,
  X,
  Check,
  ChevronRight,
  Settings,
  Vibrate,
  Zap,
  Moon,
  Waves,
  Activity,
  CloudRain,
  Newspaper,
  Coffee,
  Sparkles,
  Zap as Strobe,
  Sun,
  ShieldAlert,
  Lock,
  ZapOff,
  Globe,
  PlusCircle,
  Timer,
  History,
  Play,
  Pause,
  RotateCcw,
  Flag,
  TimerReset
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { GoogleGenAI } from "@google/genai";
import { Alarm, AlarmStatus, CrescendoConfig, WorldClockItem, TimerItem } from './types';

// Constants
const DEFAULT_TONE = {
  name: 'Standard Alarm',
  url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'
};

const PRESETS = [
  DEFAULT_TONE,
  { name: 'Digital Siren', url: 'https://assets.mixkit.co/active_storage/sfx/1000/1000-preview.mp3' },
  { name: 'Morning Bells', url: 'https://assets.mixkit.co/active_storage/sfx/461/461-preview.mp3' },
  { name: 'Synth Pulse', url: 'https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3' }
];

export default function App() {
  const [time, setTime] = useState(new Date());
  const [alarms, setAlarms] = useState<Alarm[]>(() => {
    const saved = localStorage.getItem('chronos_alarms');
    return saved ? JSON.parse(saved) : [];
  });
  const [crescendoConfig, setCrescendoConfig] = useState<CrescendoConfig>(() => {
    const saved = localStorage.getItem('chronos_crescendo');
    const defaults: CrescendoConfig = {
      initialVolume: 0.0,
      targetVolume: 1.0,
      duration: 30,
      progressionStyle: 'linear',
      vibrationSync: 'immediate',
      vibrationPattern: 'steady',
      challengeType: 'none',
      snoozeReset: 'restart',
      sleepTrackingEnabled: false,
      smartWakeWindow: 30,
      sleepSensitivity: 0.5,
      preAlarmWindow: false,
      snoozeDuration: 5,
      maxSnoozes: 3,
      briefingEnabled: false,
      briefingType: 'both',
      location: 'New York',
      bedtimeRemindersEnabled: false,
      targetSleepDuration: 8,
      windDownWindow: 30,
      flashlightAlertEnabled: false,
      flashlightPattern: 'pulse',
      wakeUpCheckEnabled: false,
      wakeUpCheckDelay: 5,
      editPreventionEnabled: false,
      editPreventionWindow: 15,
      extraLoudEnabled: false,
      extraLoudDelay: 60,
      extraLoudToneUrl: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' // Default fallback
    };
    
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  });
  const [isAddingAlarm, setIsAddingAlarm] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'alarms' | 'world' | 'timers' | 'stopwatch'>('alarms');
  const [worldClocks, setWorldClocks] = useState<WorldClockItem[]>(() => {
    const saved = localStorage.getItem('chronos_world_clocks');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'London', timezone: 'Europe/London' },
      { id: '2', name: 'New York', timezone: 'America/New_York' },
      { id: '3', name: 'Tokyo', timezone: 'Asia/Tokyo' }
    ];
  });
  const [timers, setTimers] = useState<TimerItem[]>(() => {
    const saved = localStorage.getItem('chronos_timers');
    return saved ? JSON.parse(saved) : [];
  });
  const [isAddingClock, setIsAddingClock] = useState(false);
  const [isAddingTimer, setIsAddingTimer] = useState(false);
  
  // Stopwatch State
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const [laps, setLaps] = useState<{ id: string, time: number, total: number }[]>([]);
  
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('chronos_theme');
    return saved || 'midnight';
  });
  const [isPremium, setIsPremium] = useState(true); // Default to true for testing
  const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);
  const [status, setStatus] = useState<AlarmStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [lastTriggeredMinute, setLastTriggeredMinute] = useState<string | null>(null);
  const [preAlarmActive, setPreAlarmActive] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepActivity, setSleepActivity] = useState<{time: number, value: number}[]>([]);
  const [smartWakeTriggered, setSmartWakeTriggered] = useState(false);
  const [wasSnoozed, setWasSnoozed] = useState(false);
  const [snoozeCount, setSnoozeCount] = useState(0);
  const [isBriefingActive, setIsBriefingActive] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [bedtimeNotification, setBedtimeNotification] = useState<{type: 'reminder' | 'wind-down', time: string, bedtime: string} | null>(null);
  const [lastBedtimeMinute, setLastBedtimeMinute] = useState<string | null>(null);
  const [flashlightActive, setFlashlightActive] = useState(false);
  const [extraLoudTriggered, setExtraLoudTriggered] = useState(false);
  const [pendingWakeCheck, setPendingWakeCheck] = useState<{ alarm: Alarm, time: number } | null>(null);
  const [behavioralAlert, setBehavioralAlert] = useState<string | null>(null);

  // Derived State (Moved higher for useEffect accessibility)
  const getNextAlarm = () => {
    if (alarms.length === 0) return null;
    const enabledAlarms = alarms.filter(a => a.enabled);
    if (enabledAlarms.length === 0) return null;
    
    const now = time;
    const currentDayIdx = now.getDay();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = days[currentDayIdx];
    const hour = now.getHours();
    const min = now.getMinutes();
    const nowMinutes = hour * 60 + min;

    let closestAlarm: Alarm | null = null;
    let minDiff = Infinity;

    enabledAlarms.forEach(alarm => {
      const [h, m] = alarm.time.split(':').map(Number);
      const alarmMinutes = h * 60 + m;
      const checkDays = alarm.repeat.length > 0 ? alarm.repeat : days;
      
      checkDays.forEach(dayStr => {
        const dayIdx = days.indexOf(dayStr);
        let dayDiff = dayIdx - currentDayIdx;
        if (dayDiff < 0) dayDiff += 7;
        
        let totalMinutesDiff = dayDiff * 24 * 60 + (alarmMinutes - nowMinutes);
        if (totalMinutesDiff <= 0) {
          if (alarm.repeat.length === 0 || (alarm.repeat.length === 1 && alarm.repeat[0] === currentDay)) {
            totalMinutesDiff += 7 * 24 * 60;
          } else if (dayDiff === 0) {
             totalMinutesDiff += 7 * 24 * 60; 
          }
        }

        if (totalMinutesDiff > 0 && totalMinutesDiff < minDiff) {
          minDiff = totalMinutesDiff;
          closestAlarm = alarm;
        }
      });
    });

    return closestAlarm;
  };

  const nextAlarm = getNextAlarm();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);
  const ringingStartRef = useRef<number | null>(null);

  const setTorch = async (on: boolean) => {
    try {
      if (on) {
        if (!torchTrackRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          const track = stream.getVideoTracks()[0];
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            torchTrackRef.current = track;
            await track.applyConstraints({ advanced: [{ torch: true }] } as any);
          } else {
             // Fallback: use screen flashing if no hardware torch? 
             // For now, just set state for visual fallback in UI
          }
        } else {
          await torchTrackRef.current.applyConstraints({ advanced: [{ torch: true }] } as any);
        }
      } else {
        if (torchTrackRef.current) {
          await torchTrackRef.current.applyConstraints({ advanced: [{ torch: false }] } as any);
          // Don't stop the track yet, might need it for next pulse
        }
      }
    } catch (e) {
      console.error("Flashlight error:", e);
    }
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem('chronos_alarms', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    localStorage.setItem('chronos_crescendo', JSON.stringify(crescendoConfig));
  }, [crescendoConfig]);

  useEffect(() => {
    localStorage.setItem('chronos_world_clocks', JSON.stringify(worldClocks));
  }, [worldClocks]);

  useEffect(() => {
    localStorage.setItem('chronos_timers', JSON.stringify(timers));
  }, [timers]);

  useEffect(() => {
    localStorage.setItem('chronos_theme', theme);
    const themes: Record<string, { bg: string, card: string, accent: string }> = {
      midnight: { bg: '#0A0B10', card: '#161821', accent: '#6366F1' },
      forest: { bg: '#050B08', card: '#0E1A14', accent: '#10B981' },
      embers: { bg: '#0F0505', card: '#1A0E0E', accent: '#F43F5E' },
      ocean: { bg: '#050A14', card: '#0E1528', accent: '#3B82F6' },
      amethyst: { bg: '#0B050F', card: '#150E1A', accent: '#A855F7' }
    };
    const t = themes[theme] || themes.midnight;
    document.documentElement.style.setProperty('--theme-bg', t.bg);
    document.documentElement.style.setProperty('--theme-card', t.card);
    document.documentElement.style.setProperty('--theme-accent', t.accent);
  }, [theme]);

  // Stopwatch Logic
  useEffect(() => {
    let interval: number | null = null;
    if (isStopwatchRunning) {
      interval = window.setInterval(() => {
        setStopwatchTime(prev => prev + 10);
      }, 10);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isStopwatchRunning]);

  // Gradual Volume Control (Crescendo)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => prev.map(timer => {
        if (timer.isRunning && timer.timeLeft > 0) {
          const nextTime = timer.timeLeft - 1;
          if (nextTime === 0) {
            return { ...timer, timeLeft: 0, isRunning: false, isCompleted: true };
          }
          return { ...timer, timeLeft: nextTime };
        }
        return timer;
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let volumeInterval: number | null = null;
    const { initialVolume, targetVolume, duration, progressionStyle, snoozeReset } = crescendoConfig;
    
    const INTERVAL_MS = progressionStyle === 'linear' ? 500 : 30000; // 30s steps or 500ms linear
    const totalSteps = (duration * 1000) / INTERVAL_MS;
    const volumeStep = (targetVolume - initialVolume) / totalSteps;

    if (status === 'ringing' && audioRef.current && !isMuted) {
      const startVolume = (wasSnoozed && snoozeReset === 'maintain') ? targetVolume : initialVolume;
      audioRef.current.volume = startVolume;
      let currentVolume = startVolume;

      if (currentVolume < targetVolume) {
        volumeInterval = window.setInterval(() => {
          if (audioRef.current) {
            if (progressionStyle === 'linear') {
              currentVolume = Math.min(targetVolume, currentVolume + volumeStep);
            } else {
              // Stepped: jump 5%
              currentVolume = Math.min(targetVolume, currentVolume + 0.05);
            }
            
            audioRef.current.volume = currentVolume;
            
            if (currentVolume >= targetVolume) {
              if (volumeInterval) clearInterval(volumeInterval);
            }
          }
        }, INTERVAL_MS);
      }
    }

    return () => {
      if (volumeInterval) clearInterval(volumeInterval);
      if (audioRef.current) {
        if (status !== 'ringing') {
          audioRef.current.volume = targetVolume;
        }
      }
    };
  }, [status, isMuted, crescendoConfig]);

  // Vibration Logic
  useEffect(() => {
    let vibeInterval: number | null = null;
    const { vibrationSync, vibrationPattern, targetVolume } = crescendoConfig;

    const startVibrating = () => {
      if (!('vibrate' in navigator)) return;
      
      const patterns: Record<string, number[]> = {
        steady: [1000],
        pulse: [500, 500],
        heartbeat: [100, 100, 100, 400],
        rapid: [100, 50]
      };
      
      const pattern = patterns[vibrationPattern] || patterns.steady;
      const interval = pattern.reduce((a, b: number) => a + b, 0);

      const doVibe = () => navigator.vibrate(pattern);
      doVibe();
      vibeInterval = window.setInterval(doVibe, interval);
    };

    if (status === 'ringing') {
      if (vibrationSync === 'immediate') {
        startVibrating();
      } else {
        // At Target Sync: Check every second if volume reached target
        const checkTarget = setInterval(() => {
          if (audioRef.current && audioRef.current.volume >= targetVolume) {
            startVibrating();
            clearInterval(checkTarget);
          }
        }, 1000);
        return () => {
          clearInterval(checkTarget);
          if (vibeInterval) clearInterval(vibeInterval);
          if ('vibrate' in navigator) navigator.vibrate(0);
        };
      }
    }

    return () => {
      if (vibeInterval) clearInterval(vibeInterval);
      if ('vibrate' in navigator) navigator.vibrate(0);
    };
  }, [status, crescendoConfig]);

  // Sleep Tracking & Smart Wake
  useEffect(() => {
    if (!isSleeping || !crescendoConfig.sleepTrackingEnabled) {
      setSleepActivity([]);
      setSmartWakeTriggered(false);
      return;
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let scriptProcessor: ScriptProcessorNode | null = null;

    const startTracking = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        scriptProcessor.onaudioprocess = () => {
          const array = new Uint8Array(analyser!.frequencyBinCount);
          analyser!.getByteFrequencyData(array);
          let values = 0;
          for (let i = 0; i < array.length; i++) {
            values += array[i];
          }
          const average = values / array.length;
          const normalized = average / 128; // 0 to 2 approx
          
          setSleepActivity(prev => {
            const next = [...prev, { time: Date.now(), value: normalized }];
            if (next.length > 100) return next.slice(1);
            return next;
          });

          // Smart Wake Logic
          if (!smartWakeTriggered && status === 'idle' && nextAlarm) {
            const alarmTime = new Date();
            const [h, m] = nextAlarm.time.split(':').map(Number);
            alarmTime.setHours(h, m, 0, 0);
            
            // Handle if alarm is tomorrow
            if (alarmTime.getTime() < Date.now()) {
              alarmTime.setDate(alarmTime.getDate() + 1);
            }

            const diffMinutes = (alarmTime.getTime() - Date.now()) / (1000 * 60);
            
            if (diffMinutes > 0 && diffMinutes <= crescendoConfig.smartWakeWindow) {
              // Within window, check if light sleep (peak in movement/sound)
              if (normalized > (1.1 - crescendoConfig.sleepSensitivity)) {
                setSmartWakeTriggered(true);
                triggerAlarm(nextAlarm);
              }
            }
          }
        };
      } catch (err) {
        console.error('Microphone access denied for sleep tracking', err);
      }
    };

    startTracking();

    return () => {
      if (scriptProcessor) scriptProcessor.disconnect();
      if (microphone) microphone.disconnect();
      if (audioContext) audioContext.close();
    };
  }, [isSleeping, crescendoConfig.sleepTrackingEnabled, nextAlarm, status, smartWakeTriggered]);

  // Flashlight Alerts Logic
  useEffect(() => {
    let flashInterval: number | null = null;
    const { flashlightAlertEnabled, flashlightPattern } = crescendoConfig;

    if (status === 'ringing' && flashlightAlertEnabled) {
      if (flashlightPattern === 'steady') {
        setTorch(true);
        setFlashlightActive(true);
      } else {
        const interval = flashlightPattern === 'strobe' ? 100 : 500;
        let isOn = false;
        flashInterval = window.setInterval(() => {
          isOn = !isOn;
          setTorch(isOn);
          setFlashlightActive(isOn);
        }, interval);
      }
    } else {
      setTorch(false);
      setFlashlightActive(false);
      if (torchTrackRef.current) {
        torchTrackRef.current.stop();
        torchTrackRef.current = null;
      }
    }

    return () => {
      if (flashInterval) clearInterval(flashInterval);
      setTorch(false);
      if (torchTrackRef.current) {
        torchTrackRef.current.stop();
        torchTrackRef.current = null;
      }
    };
  }, [status, crescendoConfig.flashlightAlertEnabled, crescendoConfig.flashlightPattern]);

  // Extra Loud Guard
  useEffect(() => {
    if (status !== 'ringing') {
      setExtraLoudTriggered(false);
      ringingStartRef.current = null;
      return;
    }

    if (!crescendoConfig.extraLoudEnabled) return;

    if (ringingStartRef.current === null) {
      ringingStartRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (ringingStartRef.current && !extraLoudTriggered) {
        const elapsed = (Date.now() - ringingStartRef.current) / 1000;
        if (elapsed >= crescendoConfig.extraLoudDelay) {
          setExtraLoudTriggered(true);
          setBehavioralAlert("EXECUTIVE OVERRIDE: ALARM IGNORED. INCREASING INTENSITY.");
          if (audioRef.current) {
             audioRef.current.src = crescendoConfig.extraLoudToneUrl;
             audioRef.current.volume = 1.0;
             audioRef.current.play();
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, extraLoudTriggered, crescendoConfig.extraLoudEnabled, crescendoConfig.extraLoudDelay, crescendoConfig.extraLoudToneUrl]);

  // Wake-up Check logic
  useEffect(() => {
    if (!pendingWakeCheck || status !== 'idle') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diffMin = (now - pendingWakeCheck.time) / (1000 * 60);
      
      if (diffMin >= crescendoConfig.wakeUpCheckDelay) {
        setBehavioralAlert("WAKE-UP CHECK FAILED. RE-TRIGGERING ALARM.");
        triggerAlarm(pendingWakeCheck.alarm);
        setPendingWakeCheck(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingWakeCheck, status, crescendoConfig.wakeUpCheckDelay]);

  // Audio Control
  useEffect(() => {
    if (status === 'ringing' && activeAlarm) {
      if (!audioRef.current) {
        audioRef.current = new Audio(activeAlarm.toneUrl || DEFAULT_TONE.url);
        audioRef.current.loop = true;
      } else {
        audioRef.current.src = activeAlarm.toneUrl || DEFAULT_TONE.url;
      }

      const startVolume = (wasSnoozed && crescendoConfig.snoozeReset === 'maintain') 
        ? crescendoConfig.targetVolume 
        : crescendoConfig.initialVolume;
      audioRef.current.volume = startVolume;
      
      if (!isMuted) {
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [status, isMuted, activeAlarm, crescendoConfig.initialVolume, crescendoConfig.targetVolume]);

  const triggerAlarm = (alarm: Alarm) => {
    setActiveAlarm(alarm);
    setStatus('ringing');
    setLastTriggeredMinute(alarm.time);
    setPreAlarmActive(false);
    setWasSnoozed(false);
    setSnoozeCount(0);
  };

  const checkBedtime = useCallback((now: Date) => {
    if (!crescendoConfig.bedtimeRemindersEnabled || !nextAlarm) return;

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

    if (lastBedtimeMinute === currentTimeStr) return;

    // Calculate target bedtime
    const [h, m] = nextAlarm.time.split(':').map(Number);
    const alarmDate = new Date(now);
    alarmDate.setHours(h, m, 0, 0);
    if (alarmDate.getTime() <= now.getTime()) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }

    const bedtimeDate = new Date(alarmDate.getTime() - crescendoConfig.targetSleepDuration * 60 * 60 * 1000);
    const windDownDate = new Date(bedtimeDate.getTime() - crescendoConfig.windDownWindow * 60 * 1000);

    const bedtimeTimeStr = `${bedtimeDate.getHours().toString().padStart(2, '0')}:${bedtimeDate.getMinutes().toString().padStart(2, '0')}`;
    const windDownTimeStr = `${windDownDate.getHours().toString().padStart(2, '0')}:${windDownDate.getMinutes().toString().padStart(2, '0')}`;

    if (currentTimeStr === bedtimeTimeStr) {
      setBedtimeNotification({ type: 'reminder', time: currentTimeStr, bedtime: bedtimeTimeStr });
      setLastBedtimeMinute(currentTimeStr);
    } else if (currentTimeStr === windDownTimeStr) {
      setBedtimeNotification({ type: 'wind-down', time: currentTimeStr, bedtime: bedtimeTimeStr });
      setLastBedtimeMinute(currentTimeStr);
    }
  }, [crescendoConfig, nextAlarm, lastBedtimeMinute]);

  const checkAlarms = useCallback((now: Date) => {
    if (status !== 'idle') return;

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
    
    if (lastTriggeredMinute === currentTimeStr) return;

    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];

    const ringingAlarm = alarms.find(alarm => {
      if (!alarm.enabled) return false;
      if (alarm.time !== currentTimeStr) return false;
      if (alarm.repeat.length > 0 && !alarm.repeat.includes(day)) return false;
      return true;
    });

    if (ringingAlarm) {
      triggerAlarm(ringingAlarm);
    } else if (crescendoConfig.preAlarmWindow) {
      // Pre-alarm check (2 minutes before)
      const twoMinsLater = new Date(now.getTime() + 2 * 60 * 1000);
      const preHour = twoMinsLater.getHours().toString().padStart(2, '0');
      const preMin = twoMinsLater.getMinutes().toString().padStart(2, '0');
      const preTimeStr = `${preHour}:${preMin}`;

      const soonAlarm = alarms.find(a => a.enabled && a.time === preTimeStr && (a.repeat.length === 0 || a.repeat.includes(day)));
      if (soonAlarm) {
        setPreAlarmActive(true);
      } else {
        setPreAlarmActive(false);
      }
    }
  }, [alarms, status, lastTriggeredMinute, crescendoConfig]);

  const addAlarm = (newAlarm: Alarm) => {
    const updated = [...alarms, newAlarm].sort((a, b) => a.time.localeCompare(b.time));
    setAlarms(updated);
    setIsAddingAlarm(false);
  };

  const isAlarmLocked = useCallback((alarm: Alarm) => {
    if (!crescendoConfig.editPreventionEnabled) return false;
    
    const [h, m] = alarm.time.split(':').map(Number);
    const alarmTime = new Date();
    alarmTime.setHours(h, m, 0, 0);
    
    // Check if alarm is for today or tomorrow
    if (alarmTime.getTime() < Date.now()) {
      alarmTime.setDate(alarmTime.getDate() + 1);
    }

    const diffMs = alarmTime.getTime() - Date.now();
    const diffMin = diffMs / (1000 * 60);

    return diffMin > 0 && diffMin <= crescendoConfig.editPreventionWindow;
  }, [crescendoConfig.editPreventionEnabled, crescendoConfig.editPreventionWindow]);

  const updateAlarm = (updatedAlarm: Alarm) => {
    if (isAlarmLocked(updatedAlarm)) {
      setBehavioralAlert("EDIT PREVENTION: ALARM IS LOCKED. CHANGES NOT ALLOWED SO CLOSE TO SCHEDULE.");
      return;
    }
    const updated = alarms.map(a => a.id === updatedAlarm.id ? updatedAlarm : a)
      .sort((a, b) => a.time.localeCompare(b.time));
    setAlarms(updated);
    setEditingAlarm(null);
  };

  const toggleAlarm = (id: string) => {
    const alarm = alarms.find(a => a.id === id);
    if (alarm && isAlarmLocked(alarm)) {
      setBehavioralAlert("EDIT PREVENTION: ALARM IS LOCKED. CANNOT DISABLE SO CLOSE TO SCHEDULE.");
      return;
    }
    setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAlarm = (id: string) => {
    const alarm = alarms.find(a => a.id === id);
    if (alarm && isAlarmLocked(alarm)) {
      setBehavioralAlert("EDIT PREVENTION: ALARM IS LOCKED. DELETION NOT ALLOWED SO CLOSE TO SCHEDULE.");
      return;
    }
    setAlarms(alarms.filter(a => a.id !== id));
  };

  // Clock Tick
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now);
      checkAlarms(now);
      checkBedtime(now);
    }, 1000);
    return () => clearInterval(timer);
  }, [alarms, status, checkAlarms, checkBedtime]);

  const dismissAlarm = async () => {
    if (crescendoConfig.wakeUpCheckEnabled && activeAlarm) {
      setPendingWakeCheck({ alarm: activeAlarm, time: Date.now() });
      setBehavioralAlert(`WAKE-UP CHECK ACTIVATED: PLEASE REMAIN ACTIVE. RE-CHECK IN ${crescendoConfig.wakeUpCheckDelay} MIN.`);
    }

    setStatus('idle');
    setActiveAlarm(null);
    setSnoozeCount(0);
    
    if (crescendoConfig.briefingEnabled) {
      const text = await generateBriefing();
      playBriefing(text);
    }
  };

  const generateBriefing = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Provide a concise morning briefing (max 100 words) for a user in ${crescendoConfig.location}. 
      Include ${crescendoConfig.briefingType === 'both' ? 'weather and top 3 news headlines' : crescendoConfig.briefingType}. 
      Keep it energetic and helpful as an alarm clock assistant.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true }
      } as any);
      
      return response.text || "Good morning! Have a wonderful day.";
    } catch (error) {
      console.error("Briefing generation failed:", error);
      return "Good morning! I couldn't reach the news servers, but have a courageous day anyway.";
    }
  };

  const playBriefing = (text: string) => {
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    // Prefer a clear English voice
    utterance.voice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || 
                     voices.find(v => v.lang.startsWith('en')) || 
                     null;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => setIsBriefingActive(true);
    utterance.onend = () => setIsBriefingActive(false);
    utterance.onerror = () => setIsBriefingActive(false);
    
    window.speechSynthesis.speak(utterance);
    setBriefingText(text);
  };

  const snoozeAlarm = () => {
    if (crescendoConfig.maxSnoozes > 0 && snoozeCount >= crescendoConfig.maxSnoozes) {
      return; // Cannot snooze anymore
    }

    setStatus('snoozed');
    setWasSnoozed(true);
    setSnoozeCount(prev => prev + 1);
    
    setTimeout(() => {
      setStatus((current) => {
        if (current === 'snoozed') {
          return 'ringing';
        }
        return current;
      });
    }, crescendoConfig.snoozeDuration * 60 * 1000);
  };

  const formatRepeat = (repeat: string[]) => {
    if (repeat.length === 0) return 'Once';
    if (repeat.length === 7) return 'Daily';
    
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const weekends = ['Sat', 'Sun'];
    
    const hasAllWeekdays = weekdays.every(d => repeat.includes(d)) && repeat.length === 5;
    const hasAllWeekends = weekends.every(d => repeat.includes(d)) && repeat.length === 2;
    
    if (hasAllWeekdays) return 'Weekdays';
    if (hasAllWeekends) return 'Weekends';
    
    return repeat.join(', ');
  };

  return (
    <div className={`min-h-screen bg-bg text-white font-sans selection:bg-accent-primary selection:text-white flex flex-col items-center lg:justify-center p-4 lg:p-0 pb-32 lg:pb-0 transition-colors duration-[2000ms] ${preAlarmActive ? 'bg-accent-primary/20' : ''}`}>
      
      {/* Background Subtle Gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-accent-primary/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-[1024px] lg:h-[768px] grid lg:grid-cols-[1fr,340px] gap-8 p-6 lg:p-10 relative overflow-hidden">
        
        {/* Top Left Settings Button - Adjusted for layout */}
        <div className="absolute top-4 left-4 lg:top-10 lg:left-10 z-20">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-text-dim hover:text-white hover:bg-white/[0.15] vertical-transition backdrop-blur-xl shadow-2xl shadow-black/40 group active:scale-95"
          >
            <Settings className="w-5 h-5 lg:w-6 lg:h-6 group-hover:rotate-90 transition-transform duration-700 ease-out" />
          </button>
        </div>
        
        {/* Left Section: Hero Clock */}
        <section className="flex flex-col justify-center pt-16 lg:pt-0 lg:pl-5 space-y-4 relative">
          <AnimatePresence mode="wait">
            {isSleeping ? (
              <SleepDashboard 
                key="sleep-view"
                onExit={() => setIsSleeping(false)} 
                activityData={sleepActivity}
                nextAlarm={nextAlarm}
              />
            ) : (
              <motion.div 
                key="clock-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col space-y-4"
              >
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-text-dim text-lg font-medium tracking-[0.1em] uppercase"
                >
                  {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[120px] lg:text-[160px] font-extralight leading-[0.9] tracking-[-0.04em] text-gradient flex items-baseline gap-2"
                >
                  {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                  <span className="text-4xl font-light opacity-30 select-none">
                    {time.toLocaleTimeString('en-US', { second: '2-digit' })}
                  </span>
                </motion.div>

                {nextAlarm && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-10 bg-accent-primary/10 border-l-4 border-accent-primary p-4 lg:p-5 rounded-[4px_12px_12px_4px] w-fit"
                  >
                    <div className="text-xs font-bold text-accent-primary uppercase tracking-wider mb-1">Next Alarm</div>
                    <div className="text-lg font-medium flex items-center gap-2">
                      <span>{nextAlarm.label || 'Alarm'}</span>
                      <span className="opacity-40">&bull;</span>
                      <span className="font-mono">{nextAlarm.time}</span>
                    </div>
                  </motion.div>
                )}

                {/* Status Footer - Elements from the Design */}
                <div className="hidden lg:flex absolute bottom-10 left-10 gap-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-xl">☁️</div>
                    <div className="text-sm leading-tight">
                      <span className="text-text-dim block">Weather</span>
                      <span className="font-semibold">18°C Partly Cloudy</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-xl">🌙</div>
                    <div className="text-sm leading-tight">
                      <span className="text-text-dim block">Sleep Goal</span>
                      <span className="font-semibold">7h 45m / 8h</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-xl">🔇</div>
                    <div className="text-sm leading-tight">
                      <span className="text-text-dim block">Mode</span>
                      <span className="font-semibold">Do Not Disturb</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
        </AnimatePresence>
      </section>

      {/* Right Section: Alarms Panel */}
        <aside className="bg-card rounded-[32px] border border-border p-8 flex flex-col shadow-[0_40px_100px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">
                {activeTab === 'alarms' ? 'Alarms' : activeTab === 'world' ? 'World Clock' : activeTab === 'timers' ? 'Timers' : 'Stopwatch'}
              </h2>
              {activeTab === 'alarms' && alarms.length > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-accent-primary/10 text-accent-primary text-[10px] font-bold">
                  {alarms.length}
                </span>
              )}
            </div>
            {activeTab !== 'stopwatch' ? (
              <button 
                onClick={() => {
                  if (activeTab === 'alarms') setIsAddingAlarm(true);
                  else if (activeTab === 'world') setIsAddingClock(true);
                  else setIsAddingTimer(true);
                }}
                className="w-9 h-9 rounded-full bg-accent-primary flex items-center justify-center text-xl font-light hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent-primary/20"
              >
                <Plus className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={() => {
                  setStopwatchTime(0);
                  setIsStopwatchRunning(false);
                  setLaps([]);
                }}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-text-dim hover:text-white hover:bg-white/20 transition-all"
                title="Reset Stopwatch"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
            <AnimatePresence mode="wait">
              {activeTab === 'alarms' ? (
                <motion.div 
                  key="alarms-tab"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4"
                >
                  {alarms.length === 0 ? (
                    <div className="text-center py-12 text-text-dim/40 italic font-medium text-sm">
                      No scheduled alarms
                    </div>
                  ) : (
                    alarms.map((alarm) => (
                      <motion.div
                        key={alarm.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`group relative p-5 rounded-[20px] border border-border flex justify-between items-center transition-all ${
                          alarm.enabled ? 'bg-white/[0.06]' : 'bg-white/[0.03] opacity-50'
                        }`}
                      >
                        <div>
                          <div className="text-2xl font-medium tracking-tight">
                            {alarm.time}
                          </div>
                          <div className="text-[13px] text-text-dim mt-0.5">
                            {formatRepeat(alarm.repeat)}
                            {alarm.label && ` • ${alarm.label}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => setEditingAlarm(alarm)}
                              className="p-2 border border-border rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-all"
                            >
                              <Settings2 className="w-4 h-4 text-text-dim" />
                            </button>
                            <button 
                              onClick={() => deleteAlarm(alarm.id)}
                              className="p-2 border border-border rounded-lg bg-white/[0.03] hover:bg-white/[0.1] text-accent-secondary transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <button 
                            onClick={() => toggleAlarm(alarm.id)}
                            className={`relative w-[50px] h-[28px] rounded-full p-1 transition-colors ${
                              alarm.enabled ? 'bg-success' : 'bg-slate-700'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                              alarm.enabled ? 'translate-x-[22px]' : 'translate-x-[0px]'
                            }`} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              ) : activeTab === 'world' ? (
                <motion.div 
                  key="world-tab"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  {worldClocks.length === 0 ? (
                    <div className="text-center py-12 text-text-dim/40 italic font-medium text-sm">
                      No world clocks added
                    </div>
                  ) : (
                    worldClocks.map((clock) => (
                      <WorldClockRow 
                        key={clock.id} 
                        clock={clock} 
                        onDelete={(id) => setWorldClocks(prev => prev.filter(c => c.id !== id))}
                      />
                    ))
                  )}
                </motion.div>
              ) : activeTab === 'timers' ? (
                <motion.div 
                  key="timers-tab"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-4"
                >
                  {timers.length === 0 ? (
                    <div className="text-center py-12 text-text-dim/40 italic font-medium text-sm">
                      No timers active
                    </div>
                  ) : (
                    timers.map((timer) => (
                      <TimerRow 
                        key={timer.id} 
                        timer={timer}
                        onToggle={(id) => setTimers(prev => prev.map(t => t.id === id ? { ...t, isRunning: !t.isRunning } : t))}
                        onDelete={(id) => setTimers(prev => prev.filter(t => t.id !== id))}
                        onReset={(id) => setTimers(prev => prev.map(t => t.id === id ? { ...t, timeLeft: t.duration, isRunning: false, isCompleted: false } : t))}
                      />
                    ))
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="stopwatch-tab"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex flex-col h-full"
                >
                  <StopwatchView 
                    time={stopwatchTime}
                    isRunning={isStopwatchRunning}
                    laps={laps}
                    onToggle={() => setIsStopwatchRunning(!isStopwatchRunning)}
                    onLap={() => {
                      const lastTotal = laps.length > 0 ? laps[0].total : 0;
                      const lapTime = stopwatchTime - lastTotal;
                      setLaps([{ id: Math.random().toString(36).substr(2, 9), time: lapTime, total: stopwatchTime }, ...laps]);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden lg:flex mt-6 pt-5 border-t border-border justify-between items-center text-sm font-medium">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-text-dim" />
              <span className="text-text-dim">Bedtime Mode</span>
            </div>
            <button 
              onClick={() => setIsSleeping(!isSleeping)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                isSleeping ? 'bg-accent-primary text-white' : 'bg-white/5 text-text-dim hover:text-white'
              }`}
            >
              {isSleeping ? 'Active' : 'Start'}
            </button>
          </div>
        </aside>

        {/* Global Fixed Bottom Navigation (Mobile) + Desktop Sidebar Nav */}
        <div className="fixed bottom-0 left-0 right-0 z-[40] lg:absolute lg:bottom-10 lg:right-10 lg:left-auto lg:z-auto lg:w-[340px] px-4 py-6 lg:p-0 pointer-events-none">
          <div className="max-w-[1024px] mx-auto w-full pointer-events-auto">
            <div className="lg:hidden flex justify-between items-center text-sm font-medium mb-4 bg-card/40 backdrop-blur-md border border-border p-3 rounded-2xl">
              <div className="flex items-center gap-2 ml-2">
                <Moon className="w-4 h-4 text-text-dim" />
                <span className="text-text-dim">Bedtime Mode</span>
              </div>
              <button 
                onClick={() => setIsSleeping(!isSleeping)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                  isSleeping ? 'bg-accent-primary text-white' : 'bg-white/5 text-text-dim hover:text-white'
                }`}
              >
                {isSleeping ? 'Active' : 'Start'}
              </button>
            </div>

            <nav className="flex items-center justify-around bg-card/90 lg:bg-white/5 border border-white/5 rounded-[24px] p-2 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] lg:shadow-none">
              <button 
                onClick={() => setActiveTab('alarms')}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all ${activeTab === 'alarms' ? 'bg-white/10 text-accent-primary shadow-xl' : 'text-text-dim hover:text-white'}`}
              >
                <AlarmClock className="w-5 h-5 lg:w-[22px] lg:h-[22px]" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Alarms</span>
              </button>
              <button 
                onClick={() => setActiveTab('world')}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all ${activeTab === 'world' ? 'bg-white/10 text-accent-primary shadow-xl' : 'text-text-dim hover:text-white'}`}
              >
                <Globe className="w-5 h-5 lg:w-[22px] lg:h-[22px]" />
                <span className="text-[10px] font-bold uppercase tracking-widest">World</span>
              </button>
              <button 
                onClick={() => setActiveTab('timers')}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all ${activeTab === 'timers' ? 'bg-white/10 text-accent-primary shadow-xl' : 'text-text-dim hover:text-white'}`}
              >
                <Timer className="w-5 h-5 lg:w-[22px] lg:h-[22px]" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Timers</span>
              </button>
              <button 
              onClick={() => setActiveTab('stopwatch')}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all ${activeTab === 'stopwatch' ? 'bg-white/10 text-accent-primary shadow-xl' : 'text-text-dim hover:text-white'}`}
            >
              <TimerReset className="w-5 h-5 lg:w-[22px] lg:h-[22px]" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Watch</span>
            </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal 
            config={crescendoConfig}
            onClose={() => setIsSettingsOpen(false)}
            onUpdate={setCrescendoConfig}
            isPremium={isPremium}
            onPremiumToggle={setIsPremium}
            currentTheme={theme}
            onThemeChange={setTheme}
          />
        )}
      </AnimatePresence>

      {/* Add Alarm Modal */}
      <AnimatePresence>
        {isAddingAlarm && (
          <AlarmForm 
            onClose={() => setIsAddingAlarm(false)} 
            onSave={addAlarm} 
          />
        )}
        {isAddingClock && (
          <AddWorldClockModal 
            onClose={() => setIsAddingClock(false)} 
            onAdd={(clock) => {
              setWorldClocks(prev => [...prev, clock]);
              setIsAddingClock(false);
            }} 
          />
        )}
        {isAddingTimer && (
          <TimerForm 
            onClose={() => setIsAddingTimer(false)}
            onSave={(timer) => {
              setTimers(prev => [...prev, timer]);
              setIsAddingTimer(false);
            }}
          />
        )}
        {editingAlarm && (
          <AlarmForm 
            onClose={() => setEditingAlarm(null)} 
            onSave={updateAlarm}
            initialAlarm={editingAlarm}
          />
        )}
      </AnimatePresence>

      {/* Ringing Overlay */}
      <AnimatePresence>
        {status === 'ringing' && activeAlarm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 bg-bg/95 flex flex-col items-center justify-center p-8 text-center transition-colors duration-75 ${flashlightActive ? 'bg-white' : 'bg-bg/95'}`}
          >
            {flashlightActive && <div className="absolute inset-0 bg-white z-[-1]" />}
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }} 
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-32 h-32 rounded-full bg-accent-primary flex items-center justify-center mb-8 shadow-[0_0_80px_rgba(99,102,241,0.5)]"
            >
              <Bell className="w-16 h-16 text-white animate-bounce" />
            </motion.div>
            
            <h2 className="text-7xl font-sans font-extralight tracking-tighter mb-4">{activeAlarm.time}</h2>
            <p className="text-xl font-medium tracking-wide mb-1 opacity-60 text-text-dim uppercase">{activeAlarm.label || 'Alarm'}</p>
            <div className="flex items-center justify-center gap-2 mb-12 text-accent-primary animate-pulse">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Gentle Wake &bull; Increasing Volume</span>
            </div>

            <div className="w-full max-w-sm mx-auto mb-8 h-64 flex flex-col items-center justify-center">
              {crescendoConfig.challengeType === 'none' ? (
                <div className="flex flex-col gap-4 w-full max-w-xs">
                  <button 
                    onClick={dismissAlarm}
                    className="w-full py-6 rounded-2xl bg-white text-bg text-xl font-bold uppercase transition-transform active:scale-95 shadow-xl"
                  >
                    Dismiss
                  </button>
                  {!(crescendoConfig.maxSnoozes > 0 && snoozeCount >= crescendoConfig.maxSnoozes) && (
                    <button 
                      onClick={snoozeAlarm}
                      className="w-full py-6 rounded-2xl bg-white/5 text-white text-xl font-bold uppercase ring-1 ring-white/10 transition-transform active:scale-95"
                    >
                      Snooze ({crescendoConfig.snoozeDuration}m)
                      {crescendoConfig.maxSnoozes > 0 && (
                        <span className="block text-[10px] opacity-40 mt-1">
                          {snoozeCount} / {crescendoConfig.maxSnoozes} Snoozes
                        </span>
                      )}
                    </button>
                  )}
                </div>
              ) : crescendoConfig.challengeType === 'math' ? (
                <MathChallenge onComplete={dismissAlarm} />
              ) : crescendoConfig.challengeType === 'shake' ? (
                <ShakeChallenge onComplete={dismissAlarm} />
              ) : crescendoConfig.challengeType === 'qr' ? (
                <QRChallenge onComplete={dismissAlarm} />
              ) : null}
            </div>

            {crescendoConfig.challengeType !== 'none' && !(crescendoConfig.maxSnoozes > 0 && snoozeCount >= crescendoConfig.maxSnoozes) && (
              <button 
                onClick={snoozeAlarm}
                className="w-full max-w-xs py-4 rounded-2xl bg-white/5 text-white text-sm font-bold uppercase ring-1 ring-white/10 transition-transform active:scale-95"
              >
                Snooze ({crescendoConfig.snoozeDuration}m)
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

       {/* Bedtime Notification */}
      <AnimatePresence>
        {bedtimeNotification && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 100 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[65] w-full max-w-sm px-6"
          >
            <div className={`bg-bg/95 backdrop-blur-3xl border ${bedtimeNotification.type === 'wind-down' ? 'border-accent-secondary/30' : 'border-accent-primary/30'} rounded-[32px] p-6 shadow-2xl flex flex-col gap-4`}>
               <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bedtimeNotification.type === 'wind-down' ? 'bg-accent-secondary/20 text-accent-secondary' : 'bg-accent-primary/20 text-accent-primary'}`}>
                  {bedtimeNotification.type === 'wind-down' ? <Sparkles className="w-6 h-6" /> : <Coffee className="w-6 h-6" />}
                </div>
                <div className="flex-1 text-left">
                  <div className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-1 ${bedtimeNotification.type === 'wind-down' ? 'text-accent-secondary' : 'text-accent-primary'}`}>
                    {bedtimeNotification.type === 'wind-down' ? 'Time to Wind Down' : 'Sleep Call'}
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    {bedtimeNotification.type === 'wind-down' ? 'Slow down for the day' : `Bedtime is at ${bedtimeNotification.bedtime}`}
                  </h4>
                </div>
                <button 
                  onClick={() => setBedtimeNotification(null)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors self-start"
                >
                  <X className="w-4 h-4 text-text-dim" />
                </button>
              </div>
              <p className="text-xs text-text-dim leading-relaxed text-left">
                {bedtimeNotification.type === 'wind-down' 
                  ? `Your body needs prep time. We recommend putting away devices now for your ${bedtimeNotification.bedtime} sleep goal.`
                  : `To hit your ${crescendoConfig.targetSleepDuration}h sleep goal, you should be asleep by ${bedtimeNotification.bedtime}. Sweet dreams!`}
              </p>
              <button 
                onClick={() => {
                  setBedtimeNotification(null);
                  setIsSleeping(true);
                }}
                className={`w-full py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${bedtimeNotification.type === 'wind-down' ? 'bg-accent-secondary/10 text-accent-secondary border border-accent-secondary/20' : 'bg-accent-primary text-white shadow-lg'}`}
              >
                Start Sleeping Mode
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Behavioral Alert Overlay */}
      <AnimatePresence>
        {behavioralAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-6"
          >
            <div className="bg-accent-secondary/90 backdrop-blur-xl border border-white/20 rounded-3xl p-4 shadow-2xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest">System Guard</div>
                <div className="text-xs font-bold text-white leading-tight">
                  {behavioralAlert}
                </div>
              </div>
              <button 
                onClick={() => setBehavioralAlert(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Briefing Overlay */}
      <AnimatePresence>
        {isBriefingActive && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-6"
          >
            <div className="bg-bg/90 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-accent-primary/20 flex items-center justify-center animate-pulse">
                <Newspaper className="w-6 h-6 text-accent-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-accent-primary uppercase tracking-[0.2em] mb-1 text-left">Morning Update</div>
                <div className="text-xs text-white/80 line-clamp-2 leading-relaxed italic text-left">
                  "{briefingText}"
                </div>
              </div>
              <button 
                onClick={() => {
                  window.speechSynthesis.cancel();
                  setIsBriefingActive(false);
                }}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-text-dim" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsModal({ config, onClose, onUpdate, isPremium, onPremiumToggle, currentTheme, onThemeChange }: { 
  config: CrescendoConfig, 
  onClose: () => void, 
  onUpdate: (c: CrescendoConfig) => void, 
  isPremium: boolean, 
  onPremiumToggle: (v: boolean) => void,
  currentTheme: string,
  onThemeChange: (t: string) => void
}) {
  const [localConfig, setLocalConfig] = useState(config);
  const [view, setView] = useState<'menu' | 'crescendo' | 'snooze' | 'challenges' | 'sleep' | 'briefing' | 'bedtime' | 'flashlight' | 'behavioral' | 'appearance'>('menu');

  const THEMES = [
    { id: 'midnight', name: 'Midnight', color: '#6366F1' },
    { id: 'forest', name: 'Forest', color: '#10B981' },
    { id: 'embers', name: 'Embers', color: '#F43F5E' },
    { id: 'ocean', name: 'Ocean', color: '#3B82F6' },
    { id: 'amethyst', name: 'Amethyst', color: '#A855F7' }
  ];

  const handleSave = () => {
    onUpdate(localConfig);
    onClose();
  };

  const durations = [
    { label: '30s', value: 30 },
    { label: '1m', value: 60 },
    { label: '2m', value: 120 },
    { label: '5m', value: 300 },
    { label: '10m', value: 600 }
  ];

  const vibrationPatterns = [
    { label: 'Steady', value: 'steady', desc: 'Constant buzz' },
    { label: 'Pulse', value: 'pulse', desc: 'Slow rhythmic pulse' },
    { label: 'Heartbeat', value: 'heartbeat', desc: 'Double tap rhythm' },
    { label: 'Rapid', value: 'rapid', desc: 'Fast frantic pulses' }
  ];

  const snoozeDurationPresets = [
    { label: '2m', value: 2 },
    { label: '5m', value: 5 },
    { label: '10m', value: 10 },
    { label: '15m', value: 15 }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      className="fixed inset-y-0 right-0 w-full max-w-md z-[100] bg-card border-l border-border shadow-2xl flex flex-col pt-10"
    >
      <header className="px-8 flex items-center gap-4 mb-10">
        {view !== 'menu' && (
          <button 
            onClick={() => setView('menu')}
            className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-colors flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5 text-text-dim rotate-180" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-semibold">Settings</h2>
          <p className="text-xs text-text-dim font-medium uppercase tracking-widest mt-1">
            {view === 'menu' ? 'Configuration' : view}
          </p>
        </div>
        <button onClick={onClose} className="p-3 border border-border rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] transition-all">
          <X className="w-5 h-5 text-text-dim" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-10 no-scrollbar">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'menu' ? (
            <motion.div
              key="menu"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <button 
                onClick={() => setView('crescendo')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Crescendo</span>
                    <span className="text-xs text-text-dim">Intensity & volume ramp</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('snooze')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <ClockIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Snooze</span>
                    <span className="text-xs text-text-dim">Intervals and behavior</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('challenges')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group overflow-hidden relative"
              >
                {!isPremium && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-accent-secondary text-[8px] font-bold text-white uppercase tracking-widest rounded-full">Pro</div>
                )}
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-secondary/10 flex items-center justify-center text-accent-secondary">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Challenges</span>
                    <span className="text-xs text-text-dim">Math, Shake, or QR Scan</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('sleep')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Sleep Tracking</span>
                    <span className="text-xs text-text-dim">Smart wake & cycle analysis</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('briefing')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Newspaper className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Morning Briefing</span>
                    <span className="text-xs text-text-dim">Weather & news update</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('bedtime')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Coffee className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Bedtime Reminders</span>
                    <span className="text-xs text-text-dim">Sleep goals & wind-down</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('flashlight')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Flashlight Alert</span>
                    <span className="text-xs text-text-dim">Visual wake-up signals</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('behavioral')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-secondary/10 flex items-center justify-center text-accent-secondary">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Behavioral Guards</span>
                    <span className="text-xs text-text-dim">Anti-oversleep measures</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => setView('appearance')}
                className="w-full p-6 rounded-[24px] bg-white/[0.03] border border-border flex items-center justify-between hover:bg-white/[0.06] transition-all group"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Appearance</span>
                    <span className="text-xs text-text-dim">Custom themes & colors</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-dim group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          ) : view === 'appearance' ? (
            <motion.div
              key="appearance"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <PlusCircle className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Select Theme</h3>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => onThemeChange(t.id)}
                      className={`p-5 rounded-3xl border flex items-center justify-between transition-all ${
                        currentTheme === t.id ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border'
                      }`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div 
                          className="w-8 h-8 rounded-full shadow-lg"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="font-semibold text-white">{t.name}</span>
                      </div>
                      {currentTheme === t.id && <Check className="w-5 h-5 text-accent-primary" />}
                    </button>
                  ))}
                </div>
              </section>
            </motion.div>
          ) : view === 'crescendo' ? (
            <motion.div
              key="crescendo"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-10"
            >
              {/* Intensity: Floor & Ceiling */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Volume2 className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Intensity Control</h3>
                </div>
                
                <div className="space-y-6 bg-white/[0.03] p-5 rounded-[24px] border border-border">
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-text-dim font-medium">Initial Volume (Floor)</span>
                      <span className="text-accent-primary">{Math.round(localConfig.initialVolume * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="40" step="5"
                      value={(localConfig.initialVolume ?? 0) * 100}
                      onChange={(e) => setLocalConfig({...localConfig, initialVolume: parseInt(e.target.value) / 100})}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6366F1' }}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-text-dim font-medium">Target Volume (Ceiling)</span>
                      <span className="text-accent-primary">{Math.round(localConfig.targetVolume * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="50" max="100" step="5"
                      value={(localConfig.targetVolume ?? 1) * 100}
                      onChange={(e) => setLocalConfig({...localConfig, targetVolume: parseInt(e.target.value) / 100})}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6366F1' }}
                    />
                  </div>
                </div>
              </section>

              {/* Ramp-Up Duration */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <ClockIcon className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Ramp-Up Duration</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {durations.map(d => (
                    <button
                      key={d.value}
                      onClick={() => setLocalConfig({...localConfig, duration: d.value})}
                      className={`flex-1 min-w-[70px] py-3 rounded-xl border text-xs font-bold transition-all ${
                        localConfig.duration === d.value 
                          ? 'bg-accent-primary border-accent-primary text-white' 
                          : 'bg-white/[0.02] border-border text-text-dim'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Scaling Logic */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Zap className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Scaling & Progression</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLocalConfig({...localConfig, progressionStyle: 'linear'})}
                    className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all text-left ${
                      localConfig.progressionStyle === 'linear' ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest block">Linear</span>
                    <span className="text-[11px] text-text-dim leading-relaxed">Smooth, constant increase</span>
                  </button>
                  <button
                    onClick={() => setLocalConfig({...localConfig, progressionStyle: 'stepped'})}
                    className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all text-left ${
                      localConfig.progressionStyle === 'stepped' ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest block">Stepped</span>
                    <span className="text-[11px] text-text-dim leading-relaxed">Incremental jumps</span>
                  </button>
                </div>

                <div className="p-5 rounded-2xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Vibrate className="w-4 h-4 text-text-dim" />
                    <div className="text-sm font-semibold">Vibration Sync</div>
                  </div>
                  <select 
                    value={localConfig.vibrationSync}
                    onChange={(e) => setLocalConfig({...localConfig, vibrationSync: e.target.value as any})}
                    className="bg-card text-xs font-bold text-accent-primary focus:outline-none cursor-pointer p-2 rounded-lg"
                  >
                    <option value="immediate">Immediate</option>
                    <option value="at-target">At Target</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-text-dim block ml-1 text-left uppercase tracking-widest text-[10px]">Vibration Pattern</label>
                  <div className="grid grid-cols-2 gap-2">
                    {vibrationPatterns.map(p => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setLocalConfig({...localConfig, vibrationPattern: p.value as any});
                          // Preview vibration if supported
                          if ('vibrate' in navigator) {
                            const patterns: Record<string, number[]> = {
                              steady: [500],
                              pulse: [500, 500],
                              heartbeat: [100, 100, 100, 400],
                              rapid: [100, 50]
                            };
                            navigator.vibrate(patterns[p.value]);
                          }
                        }}
                        className={`p-4 rounded-2xl border flex flex-col gap-1 transition-all text-left ${
                          localConfig.vibrationPattern === p.value ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border text-text-dim'
                        }`}
                      >
                        <span className={`text-[11px] font-bold ${localConfig.vibrationPattern === p.value ? 'text-white' : ''}`}>{p.label}</span>
                        <span className="text-[9px] opacity-60 leading-tight">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold">Pre-Alarm Window</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider">Visual cues 2m before audio</span>
                  </div>
                  <button 
                    onClick={() => setLocalConfig({...localConfig, preAlarmWindow: !localConfig.preAlarmWindow})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${localConfig.preAlarmWindow ? 'bg-success' : 'bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: localConfig.preAlarmWindow ? 24 : 0 }}
                      className="w-4 h-4 rounded-full bg-white" 
                    />
                  </button>
                </div>
              </section>
            </motion.div>
          ) : view === 'behavioral' ? (
            <motion.div
              key="behavioral"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-6 text-left">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <ShieldAlert className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Anti-Oversleep Guards</h3>
                </div>

                {/* Wake-up Check */}
                <div className="space-y-3">
                  <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                    <div className="flex flex-col flex-1 pr-4 text-white">
                      <span className="text-sm font-semibold">Wake-Up Check</span>
                      <span className="text-[10px] text-text-dim uppercase tracking-wider">Re-triggers alarm if no movement detected after dismissal</span>
                    </div>
                    <button 
                      onClick={() => setLocalConfig({...localConfig, wakeUpCheckEnabled: !localConfig.wakeUpCheckEnabled})}
                      className={`w-12 h-6 rounded-full p-1 transition-colors flex-shrink-0 ${localConfig.wakeUpCheckEnabled ? 'bg-success' : 'bg-slate-700'}`}
                    >
                      <motion.div 
                        animate={{ x: localConfig.wakeUpCheckEnabled ? 24 : 0 }}
                        className="w-4 h-4 rounded-full bg-white" 
                      />
                    </button>
                  </div>
                  {localConfig.wakeUpCheckEnabled && (
                    <div className="flex items-center justify-between px-5 py-2">
                       <span className="text-[10px] font-bold uppercase text-text-dim/60">Check delay</span>
                       <select 
                        value={localConfig.wakeUpCheckDelay} 
                        onChange={(e) => setLocalConfig({...localConfig, wakeUpCheckDelay: parseInt(e.target.value)})}
                        className="bg-transparent text-accent-primary text-xs font-bold outline-none"
                       >
                         {[2, 5, 10, 15].map(v => <option key={v} value={v} className="bg-bg">{v} min</option>)}
                       </select>
                    </div>
                  )}
                </div>

                {/* Edit Prevention */}
                <div className="space-y-3">
                  <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                    <div className="flex flex-col flex-1 pr-4 text-white">
                      <span className="text-sm font-semibold">Edit Prevention</span>
                      <span className="text-[10px] text-text-dim uppercase tracking-wider">Locks alarms close to schedule to prevent impulse disabling</span>
                    </div>
                    <button 
                      onClick={() => setLocalConfig({...localConfig, editPreventionEnabled: !localConfig.editPreventionEnabled})}
                      className={`w-12 h-6 rounded-full p-1 transition-colors flex-shrink-0 ${localConfig.editPreventionEnabled ? 'bg-success' : 'bg-slate-700'}`}
                    >
                      <motion.div 
                        animate={{ x: localConfig.editPreventionEnabled ? 24 : 0 }}
                        className="w-4 h-4 rounded-full bg-white" 
                      />
                    </button>
                  </div>
                  {localConfig.editPreventionEnabled && (
                    <div className="flex items-center justify-between px-5 py-2">
                       <span className="text-[10px] font-bold uppercase text-text-dim/60">Lock window</span>
                       <select 
                        value={localConfig.editPreventionWindow} 
                        onChange={(e) => setLocalConfig({...localConfig, editPreventionWindow: parseInt(e.target.value)})}
                        className="bg-transparent text-accent-primary text-xs font-bold outline-none"
                       >
                         {[5, 10, 15, 30, 60].map(v => <option key={v} value={v} className="bg-bg">{v} min</option>)}
                       </select>
                    </div>
                  )}
                </div>

                {/* Extra Loud */}
                <div className="space-y-3">
                  <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                    <div className="flex flex-col flex-1 pr-4 text-white">
                      <span className="text-sm font-semibold">Extra Loud (Panic)</span>
                      <span className="text-[10px] text-text-dim uppercase tracking-wider">Full volume emergency tone if alarm is ignored</span>
                    </div>
                    <button 
                      onClick={() => setLocalConfig({...localConfig, extraLoudEnabled: !localConfig.extraLoudEnabled})}
                      className={`w-12 h-6 rounded-full p-1 transition-colors flex-shrink-0 ${localConfig.extraLoudEnabled ? 'bg-accent-secondary' : 'bg-slate-700'}`}
                    >
                      <motion.div 
                        animate={{ x: localConfig.extraLoudEnabled ? 24 : 0 }}
                        className="w-4 h-4 rounded-full bg-white" 
                      />
                    </button>
                  </div>
                  {localConfig.extraLoudEnabled && (
                    <div className="flex items-center justify-between px-5 py-2">
                       <span className="text-[10px] font-bold uppercase text-text-dim/60">Activate after</span>
                       <select 
                        value={localConfig.extraLoudDelay} 
                        onChange={(e) => setLocalConfig({...localConfig, extraLoudDelay: parseInt(e.target.value)})}
                        className="bg-transparent text-accent-secondary text-xs font-bold outline-none"
                       >
                         {[30, 60, 120, 300].map(v => <option key={v} value={v} className="bg-bg">{v}s</option>)}
                       </select>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          ) : view === 'flashlight' ? (
            <motion.div
              key="flashlight"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-6 text-left">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Sun className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Visual Flashlight Alert</h3>
                </div>

                <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex flex-col text-left text-white">
                    <span className="text-sm font-semibold">Enable Flashlight</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider">Use camera flash as signal</span>
                  </div>
                  <button 
                    onClick={() => setLocalConfig({...localConfig, flashlightAlertEnabled: !localConfig.flashlightAlertEnabled})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${localConfig.flashlightAlertEnabled ? 'bg-success' : 'bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: localConfig.flashlightAlertEnabled ? 24 : 0 }}
                      className="w-4 h-4 rounded-full bg-white" 
                    />
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-semibold text-text-dim block text-left uppercase tracking-widest text-[10px]">Flash Pattern</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'pulse', label: 'Rhythmic Pulse', icon: Sun },
                      { id: 'strobe', label: 'Fast Strobe', icon: Strobe },
                      { id: 'steady', label: 'Continuous', icon: Volume2 },
                    ].map(c => {
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setLocalConfig({...localConfig, flashlightPattern: c.id as any})}
                          className={`p-5 rounded-[24px] border flex items-center justify-between transition-all text-left ${
                            localConfig.flashlightPattern === c.id ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${localConfig.flashlightPattern === c.id ? 'bg-accent-primary text-white' : 'bg-white/5 text-text-dim'}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-sm text-white">{c.label}</span>
                          </div>
                          {localConfig.flashlightPattern === c.id && <Check className="w-5 h-5 text-accent-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[11px] text-text-dim leading-relaxed px-2 bg-white/5 p-4 rounded-2xl italic">
                  Note: Flashlight alerts require camera permissions. If the hardware flash is unavailable, the entire screen will flash white as a fallback.
                </p>
              </section>
            </motion.div>
          ) : view === 'bedtime' ? (
            <motion.div
              key="bedtime"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-6 text-left">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Coffee className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Bedtime Settings</h3>
                </div>

                <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex flex-col text-left text-white">
                    <span className="text-sm font-semibold">Enable Reminders</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider">Notify based on next alarm</span>
                  </div>
                  <button 
                    onClick={() => setLocalConfig({...localConfig, bedtimeRemindersEnabled: !localConfig.bedtimeRemindersEnabled})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${localConfig.bedtimeRemindersEnabled ? 'bg-success' : 'bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: localConfig.bedtimeRemindersEnabled ? 24 : 0 }}
                      className="w-4 h-4 rounded-full bg-white" 
                    />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-xs font-semibold text-white">
                    <span className="text-text-dim font-medium uppercase tracking-widest text-[10px]">Target Sleep Duration</span>
                    <span className="text-accent-primary font-bold">{localConfig.targetSleepDuration} Hours</span>
                  </div>
                  <input 
                    type="range" min="4" max="12" step="0.5"
                    value={localConfig.targetSleepDuration}
                    onChange={(e) => setLocalConfig({...localConfig, targetSleepDuration: parseFloat(e.target.value)})}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#6366F1' }}
                  />
                  <div className="flex justify-between text-[9px] text-text-dim/40 font-bold uppercase tracking-widest">
                    <span>Performance</span>
                    <span>Longevity</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-xs font-semibold text-white">
                    <span className="text-text-dim font-medium uppercase tracking-widest text-[10px]">Wind-Down Window</span>
                    <span className="text-accent-primary font-bold">{localConfig.windDownWindow} Minutes</span>
                  </div>
                  <input 
                    type="range" min="15" max="120" step="15"
                    value={localConfig.windDownWindow}
                    onChange={(e) => setLocalConfig({...localConfig, windDownWindow: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#6366F1' }}
                  />
                  <div className="flex justify-between text-[9px] text-text-dim/40 font-bold uppercase tracking-widest">
                    <span>Quick</span>
                    <span>Deep Chill</span>
                  </div>
                </div>

                <p className="text-[11px] text-text-dim leading-relaxed px-2 bg-white/5 p-4 rounded-2xl italic">
                  Chronos will notify you {localConfig.windDownWindow}m before your ideal bedtime to help you disconnect and prepare for {localConfig.targetSleepDuration}h of rest.
                </p>
              </section>
            </motion.div>
          ) : view === 'briefing' ? (
            <motion.div
              key="briefing"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-6 text-left">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Newspaper className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Morning Briefing</h3>
                </div>

                <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex flex-col text-left text-white">
                    <span className="text-sm font-semibold">Enable Briefing</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider">Play news & weather after dismissal</span>
                  </div>
                  <button 
                    onClick={() => setLocalConfig({...localConfig, briefingEnabled: !localConfig.briefingEnabled})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${localConfig.briefingEnabled ? 'bg-success' : 'bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: localConfig.briefingEnabled ? 24 : 0 }}
                      className="w-4 h-4 rounded-full bg-white" 
                    />
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-semibold text-text-dim block text-left uppercase tracking-widest text-[10px]">Briefing Content</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'weather', label: 'Weather', icon: CloudRain },
                      { id: 'news', label: 'Top News', icon: Newspaper },
                      { id: 'both', label: 'Everything', icon: Zap },
                    ].map(c => {
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setLocalConfig({...localConfig, briefingType: c.id as any})}
                          className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all text-left ${
                            localConfig.briefingType === c.id ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${localConfig.briefingType === c.id ? 'text-accent-primary' : 'text-text-dim'}`} />
                          <span className="text-xs font-bold text-white">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                   <label className="text-xs font-semibold text-text-dim block text-left uppercase tracking-widest text-[10px]">Your Location</label>
                   <input 
                      type="text" 
                      value={localConfig.location}
                      onChange={(e) => setLocalConfig({...localConfig, location: e.target.value})}
                      placeholder="City, Country"
                      className="w-full bg-card border border-border rounded-xl p-4 text-sm focus:outline-none focus:border-accent-primary font-medium text-white"
                    />
                    <p className="text-[10px] text-text-dim/60 italic ml-1">Used for accurate weather reports.</p>
                </div>
              </section>
            </motion.div>
          ) : view === 'sleep' ? (
            <motion.div
              key="sleep"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Moon className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Sleep Cycle Settings</h3>
                </div>

                <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold">Smart Wake Window</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider">Analyze up to {localConfig.smartWakeWindow}m before alarm</span>
                  </div>
                  <select 
                    value={localConfig.smartWakeWindow}
                    onChange={(e) => setLocalConfig({...localConfig, smartWakeWindow: parseInt(e.target.value)})}
                    className="bg-card text-xs font-bold text-accent-primary focus:outline-none cursor-pointer p-2 rounded-lg"
                  >
                    {[10, 20, 30, 45, 60].map(v => <option key={v} value={v}>{v}m</option>)}
                  </select>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-text-dim font-medium uppercase tracking-widest text-[10px]">Tracking Sensitivity</span>
                    <span className="text-accent-primary font-bold">{(localConfig.sleepSensitivity * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="1.0" step="0.1"
                    value={localConfig.sleepSensitivity ?? 0.5}
                    onChange={(e) => setLocalConfig({...localConfig, sleepSensitivity: parseFloat(e.target.value)})}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: '#6366F1' }}
                  />
                  <div className="flex justify-between text-[9px] text-text-dim/40 font-bold uppercase tracking-widest">
                    <span>Deep Sleeper</span>
                    <span>Light Sleeper</span>
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-white/[0.03] border border-border flex justify-between items-center">
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold">Analyze & Logs</span>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider">Store sleep data locally</span>
                  </div>
                  <button 
                    onClick={() => setLocalConfig({...localConfig, sleepTrackingEnabled: !localConfig.sleepTrackingEnabled})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${localConfig.sleepTrackingEnabled ? 'bg-success' : 'bg-slate-700'}`}
                  >
                    <motion.div 
                      animate={{ x: localConfig.sleepTrackingEnabled ? 24 : 0 }}
                      className="w-4 h-4 rounded-full bg-white" 
                    />
                  </button>
                </div>
                
                <p className="text-[11px] text-text-dim leading-relaxed px-2 bg-white/5 p-4 rounded-2xl italic">
                  Note: Sleep tracking works best if the device is placed on the mattress near your pillow. It uses the microphone to detect subtle movements and breathing patterns.
                </p>
              </section>
            </motion.div>
          ) : view === 'challenges' ? (
            <motion.div
              key="challenges"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-8"
            >
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Settings2 className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Dismissal Challenge</h3>
                </div>

                {!isPremium ? (
                  <div className="p-8 rounded-3xl bg-accent-secondary/5 border border-accent-secondary/20 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-accent-secondary/10 flex items-center justify-center text-accent-secondary mx-auto mb-4">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h4 className="text-lg font-bold">Premium Feature</h4>
                    <p className="text-sm text-text-dim leading-relaxed">Dismissal challenges are available to premium users. Wake up your mind with puzzles!</p>
                    <button 
                      onClick={() => onPremiumToggle(true)}
                      className="w-full py-4 bg-accent-secondary text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-accent-secondary/20 active:scale-95 transition-all"
                    >
                      Unlock Premium
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[
                      { id: 'none', label: 'None', desc: 'Standard dismiss button', icon: X },
                      { id: 'math', label: 'Math Puzzle', desc: 'Solve a randomized problem', icon: Zap },
                      { id: 'shake', label: 'Shake to Wake', desc: 'Shake your device 10 times', icon: Vibrate },
                      { id: 'qr', label: 'QR Scan', desc: 'Scan a specific QR code', icon: AlarmClock },
                    ].map(c => {
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setLocalConfig({...localConfig, challengeType: c.id as any})}
                          className={`w-full p-5 rounded-3xl border flex items-center justify-between transition-all text-left ${
                            localConfig.challengeType === c.id ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${localConfig.challengeType === c.id ? 'bg-accent-primary text-white' : 'bg-white/5 text-text-dim'}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="block font-bold text-sm">{c.label}</span>
                              <span className="text-[10px] text-text-dim opacity-70 uppercase tracking-wider">{c.desc}</span>
                            </div>
                          </div>
                          {localConfig.challengeType === c.id && <Check className="w-5 h-5 text-accent-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="snooze"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-10"
            >
              <section className="space-y-6">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Settings2 className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Snooze Parameters</h3>
                </div>

                <div className="space-y-6 bg-white/[0.03] p-5 rounded-[24px] border border-border">
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-text-dim block text-left">Snooze Duration</label>
                    <div className="flex gap-2">
                      {snoozeDurationPresets.map(p => (
                        <button
                          key={p.value}
                          onClick={() => setLocalConfig({...localConfig, snoozeDuration: p.value})}
                          className={`flex-1 py-3 rounded-xl border text-[10px] font-bold transition-all ${
                            localConfig.snoozeDuration === p.value 
                              ? 'bg-accent-primary border-accent-primary text-white' 
                              : 'bg-white/[0.02] border-border text-text-dim'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-text-dim font-medium">Max Snooze Count</span>
                      <span className="text-accent-primary font-bold">{localConfig.maxSnoozes === 0 ? 'Unlimited' : localConfig.maxSnoozes}</span>
                    </div>
                    <input 
                      type="range" min="0" max="10" step="1"
                      value={localConfig.maxSnoozes ?? 0}
                      onChange={(e) => setLocalConfig({...localConfig, maxSnoozes: parseInt(e.target.value)})}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      style={{ accentColor: '#6366F1' }}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-text-dim mb-4">
                  <Zap className="w-4 h-4" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]">Reset Behavior</h3>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-text-dim block ml-1 text-left">Snooze Reset Behavior</label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setLocalConfig({...localConfig, snoozeReset: 'restart'})}
                      className={`p-5 rounded-2xl border flex items-center justify-between transition-all text-left ${
                        localConfig.snoozeReset === 'restart' ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border text-text-dim'
                      }`}
                    >
                      <div>
                        <span className="block text-xs font-bold text-white">Restart Crescendo</span>
                        <span className="text-[10px] opacity-60">Volume starts from floor again</span>
                      </div>
                      {localConfig.snoozeReset === 'restart' && <Check className="w-5 h-5 text-accent-primary" />}
                    </button>
                    <button
                      onClick={() => setLocalConfig({...localConfig, snoozeReset: 'maintain'})}
                      className={`p-5 rounded-2xl border flex items-center justify-between transition-all text-left ${
                        localConfig.snoozeReset === 'maintain' ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.02] border-border text-text-dim'
                      }`}
                    >
                      <div>
                        <span className="block text-xs font-bold text-white">Maintain Target Volume</span>
                        <span className="text-[10px] opacity-60">Loudest volume immediately after snooze</span>
                      </div>
                      {localConfig.snoozeReset === 'maintain' && <Check className="w-5 h-5 text-accent-primary" />}
                    </button>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-8 border-t border-border flex gap-3 bg-card/80 backdrop-blur-xl">
        <button 
          onClick={handleSave}
          className="flex-1 py-5 rounded-2xl bg-accent-primary text-white font-bold uppercase tracking-wider shadow-xl shadow-accent-primary/20 active:scale-95 transition-all text-sm"
        >
          {view === 'menu' ? 'Save Changes' : 'Confirm'}
        </button>
        <button 
          onClick={onClose}
          className="flex-1 py-5 rounded-2xl bg-white/[0.03] border border-border text-text-dim font-bold uppercase tracking-wider active:scale-95 transition-all text-sm"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

function AlarmForm({ onClose, onSave, initialAlarm }: { onClose: () => void, onSave: (a: Alarm) => void, initialAlarm?: Alarm }) {
  const [time, setTime] = useState(initialAlarm?.time || '08:00');
  const [label, setLabel] = useState(initialAlarm?.label || '');
  const [repeat, setRepeat] = useState<string[]>(initialAlarm?.repeat || []);
  const [tone, setTone] = useState(() => {
    if (initialAlarm) {
      return { name: initialAlarm.toneName, url: initialAlarm.toneUrl };
    }
    return DEFAULT_TONE;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    setRepeat(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTone({ name: file.name, url });
    }
  };

  const handleSave = () => {
    onSave({
      id: initialAlarm?.id || Math.random().toString(36).substr(2, 9),
      time,
      label,
      enabled: initialAlarm ? initialAlarm.enabled : true,
      repeat,
      toneUrl: tone.url,
      toneName: tone.name
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-40 bg-bg flex flex-col items-center justify-center p-6 overflow-y-auto"
    >
      <div className="w-full max-w-md space-y-12 py-12">
        <header className="flex justify-between items-center">
          <button onClick={onClose} className="p-2 border border-border rounded-xl bg-card transition-all active:scale-90">
            <X className="w-6 h-6 text-text-dim" />
          </button>
          <h2 className="text-lg font-semibold tracking-tight">{initialAlarm ? 'Edit Alarm' : 'New Alarm'}</h2>
          <div className="w-10"></div> {/* Spacer for symmetry */}
        </header>

        <div className="space-y-10">
          {/* Time Picker */}
          <div className="text-center relative">
            <input 
              type="time" 
              value={time} 
              onChange={(e) => setTime(e.target.value)}
              className="bg-transparent text-[100px] font-extralight text-center focus:outline-none text-gradient appearance-none tracking-tighter w-full"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          {/* Label */}
          <div className="space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">Alarm Label</label>
            <input 
              type="text" 
              placeholder="e.g. Morning Wakeup" 
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-card border border-border rounded-2xl p-5 text-lg focus:outline-none focus:ring-2 focus:ring-accent-primary/20 transition-all font-medium placeholder:text-text-dim/20"
            />
          </div>

          {/* Tone Selector */}
          <div className="space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">Alarm Sound</label>
            <div className="grid grid-cols-2 gap-3">
              <select 
                value={tone.url}
                onChange={(e) => {
                  const selected = PRESETS.find(p => p.url === e.target.value);
                  if (selected) setTone(selected);
                }}
                className="col-span-1 bg-card border border-border rounded-xl p-4 text-sm focus:outline-none focus:border-accent-primary text-white"
              >
                {PRESETS.map(p => (
                  <option key={p.url} value={p.url}>{p.name}</option>
                ))}
              </select>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="col-span-1 border border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase text-text-dim hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                {tone.url?.startsWith('blob:') ? 'Replace MP3' : 'Upload MP3'}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="audio/*" 
                className="hidden" 
              />
            </div>
          </div>

          {/* Repeat */}
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim">Repeat On</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setRepeat(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])}
                  className="text-[10px] uppercase font-bold text-accent-primary hover:underline"
                >
                  Weekdays
                </button>
                <button 
                  onClick={() => setRepeat(['Sat', 'Sun'])}
                  className="text-[10px] uppercase font-bold text-accent-primary hover:underline"
                >
                  Weekends
                </button>
                <button 
                  onClick={() => setRepeat(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])}
                  className="text-[10px] uppercase font-bold text-accent-primary hover:underline"
                >
                  Daily
                </button>
              </div>
            </div>
            <div className="flex justify-between gap-2">
              {days.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 aspect-square rounded-xl border flex items-center justify-center font-bold text-xs transition-all ${
                    repeat.includes(day) 
                      ? 'bg-accent-primary border-accent-primary text-white shadow-lg shadow-accent-primary/30' 
                      : 'bg-card border-border text-text-dim/60 hover:text-white hover:border-text-dim/40'
                  }`}
                >
                  {day.charAt(0)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <button 
            onClick={handleSave}
            className="w-full py-5 rounded-2xl bg-accent-primary text-white text-lg font-bold uppercase tracking-wider shadow-xl shadow-accent-primary/20 transition-transform active:scale-95"
          >
            Create Alarm
          </button>
          <button 
            onClick={onClose}
            className="w-full py-5 text-text-dim font-medium uppercase tracking-widest text-[11px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MathChallenge({ onComplete }: { onComplete: () => void }) {
  const [problem, setProblem] = useState({ q: '', a: 0 });
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    generateProblem();
  }, []);

  const generateProblem = () => {
    const a = Math.floor(Math.random() * 20) + 10;
    const b = Math.floor(Math.random() * 20) + 10;
    setProblem({ q: `${a} + ${b}`, a: a + b });
    setAnswer('');
    setError(false);
  };

  const check = () => {
    if (parseInt(answer) === problem.a) {
      onComplete();
    } else {
      setError(true);
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <div className="text-sm font-bold uppercase tracking-widest text-text-dim">Solve to Dismiss</div>
      <div className="text-5xl font-bold font-mono tracking-tighter text-white">{problem.q} = ?</div>
      <div className="w-full max-w-[200px] relative">
        <input 
          type="number"
          value={answer ?? ''}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer"
          autoFocus
          className={`w-full bg-white/5 border-2 rounded-2xl p-4 text-2xl text-center focus:outline-none transition-all ${error ? 'border-accent-secondary animate-[shake_0.5s_ease-in-out]' : 'border-white/10'}`}
        />
      </div>
      <button 
        onClick={check}
        className="px-8 py-4 bg-white text-bg rounded-2xl font-bold uppercase tracking-widest text-xs active:scale-95 transition-all"
      >
        Unlock
      </button>
    </div>
  );
}

function ShakeChallenge({ onComplete }: { onComplete: () => void }) {
  const [shakes, setShakes] = useState(0);
  const TARGET = 15;

  useEffect(() => {
    let lastTime = 0;
    let lastX = 0, lastY = 0, lastZ = 0;
    const THRESHOLD = 15;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      const currentTime = Date.now();
      if ((currentTime - lastTime) > 100) {
        const diffX = Math.abs(acc.x! - lastX);
        const diffY = Math.abs(acc.y! - lastY);
        const diffZ = Math.abs(acc.z! - lastZ);

        if (diffX + diffY + diffZ > THRESHOLD) {
          setShakes(prev => {
            const next = prev + 1;
            if (next >= TARGET) onComplete();
            return next;
          });
        }

        lastX = acc.x!;
        lastY = acc.y!;
        lastZ = acc.z!;
        lastTime = currentTime;
      }
    };

    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', handleMotion);
    }
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [onComplete]);

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <div className="text-sm font-bold uppercase tracking-widest text-text-dim">Shake to Wake</div>
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full rotate-[-90deg]">
          <circle 
            cx="64" cy="64" r="60" 
            fill="none" stroke="currentColor" strokeWidth="8"
            className="text-white/10"
          />
          <motion.circle 
            cx="64" cy="64" r="60" 
            fill="none" stroke="currentColor" strokeWidth="8"
            strokeDasharray="377"
            animate={{ strokeDashoffset: 377 - (377 * (shakes / TARGET)) }}
            className="text-accent-primary"
          />
        </svg>
        <Vibrate className="w-10 h-10 text-white animate-pulse" />
      </div>
      <div className="text-xs font-bold font-mono text-text-dim uppercase tracking-widest">
        {shakes} / {TARGET} SHAKES
      </div>
      <button 
        onClick={() => setShakes(prev => {
          const next = prev + 1;
          if (next >= TARGET) onComplete();
          return next;
        })} 
        className="opacity-20 text-[10px] uppercase font-bold text-text-dim"
      >
        (Simulate Shake)
      </button>
    </div>
  );
}

function AddWorldClockModal({ onClose, onAdd }: { onClose: () => void, onAdd: (c: WorldClockItem) => void }) {
  const COMMON_TIMEZONES = [
    { name: 'London', zone: 'Europe/London' },
    { name: 'New York', zone: 'America/New_York' },
    { name: 'Tokyo', zone: 'Asia/Tokyo' },
    { name: 'Paris', zone: 'Europe/Paris' },
    { name: 'Dubai', zone: 'Asia/Dubai' },
    { name: 'Sydney', zone: 'Australia/Sydney' },
    { name: 'Los Angeles', zone: 'America/Los_Angeles' },
    { name: 'Singapore', zone: 'Asia/Singapore' },
    { name: 'Hong Kong', zone: 'Asia/Hong_Kong' },
    { name: 'Berlin', zone: 'Europe/Berlin' },
    { name: 'Cairo', zone: 'Africa/Cairo' },
    { name: 'Mumbai', zone: 'Asia/Kolkata' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-bg/80 backdrop-blur-md flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-[40px] p-8 shadow-2xl relative overflow-hidden"
      >
        <header className="flex justify-between items-center mb-8 text-left">
          <div>
            <h2 className="text-2xl font-semibold text-white">World Clock</h2>
            <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold mt-1">Select a city</p>
          </div>
          <button onClick={onClose} className="p-3 border border-border rounded-2xl bg-white/[0.03] text-text-dim hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto no-scrollbar pr-1 pb-4">
          {COMMON_TIMEZONES.map(tz => (
            <button
              key={tz.zone}
              onClick={() => {
                onAdd({
                  id: Math.random().toString(36).substr(2, 9),
                  name: tz.name,
                  timezone: tz.zone
                });
              }}
              className="p-5 rounded-3xl bg-white/[0.03] border border-border hover:bg-white/[0.06] hover:border-accent-primary flex items-center justify-between transition-all group"
            >
              <div className="text-left">
                <div className="font-semibold text-white">{tz.name}</div>
                <div className="text-[10px] text-text-dim uppercase tracking-widest">{tz.zone}</div>
              </div>
              <PlusCircle className="w-5 h-5 text-text-dim group-hover:text-accent-primary" />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function WorldClockRow({ clock, onDelete }: { clock: WorldClockItem, onDelete: (id: string) => void, key?: any }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: clock.timezone 
  });
  
  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: clock.timezone
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-5 rounded-[24px] bg-white/[0.03] border border-border flex justify-between items-center group relative overflow-hidden"
    >
      <div className="text-left relative z-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-primary mb-1">{clock.name}</div>
        <div className="text-3xl font-light tracking-tighter text-white">{timeStr}</div>
        <div className="text-[10px] text-text-dim mt-1 font-medium">{dateStr}</div>
      </div>
      
      <div className="flex items-center gap-2 relative z-10">
        <button 
          onClick={() => onDelete(clock.id)}
          className="opacity-0 group-hover:opacity-100 p-2 border border-border rounded-lg bg-white/[0.03] hover:bg-white/[0.1] text-accent-secondary transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <Globe className="absolute -bottom-2 -right-2 w-16 h-16 text-white/[0.03] -rotate-12 pointer-events-none" />
    </motion.div>
  );
}

function TimerForm({ onClose, onSave }: { onClose: () => void, onSave: (t: TimerItem) => void }) {
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalSeconds = minutes * 60 + seconds;
    if (totalSeconds <= 0) return;

    onSave({
      id: Math.random().toString(36).substr(2, 9),
      label: label || 'Timer',
      duration: totalSeconds,
      timeLeft: totalSeconds,
      isRunning: true,
      isCompleted: false
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-bg/80 backdrop-blur-md flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-[40px] p-8 shadow-2xl relative overflow-hidden"
      >
        <header className="flex justify-between items-center mb-8 text-left">
          <div>
            <h2 className="text-2xl font-semibold text-white">New Timer</h2>
            <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold mt-1">Set duration</p>
          </div>
          <button onClick={onClose} className="p-3 border border-border rounded-2xl bg-white/[0.03] text-text-dim hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="flex justify-center items-center gap-4 text-5xl font-extralight tracking-tighter">
            <div className="flex flex-col items-center">
              <input 
                type="number" 
                value={minutes} 
                onChange={e => setMinutes(Math.max(0, parseInt(e.target.value) || 0))} 
                className="w-20 bg-transparent text-center focus:outline-none"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-dim mt-2">Min</span>
            </div>
            <span className="opacity-20 translate-y-[-8px]">:</span>
            <div className="flex flex-col items-center">
              <input 
                type="number" 
                value={seconds} 
                onChange={e => setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} 
                className="w-20 bg-transparent text-center focus:outline-none"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-dim mt-2">Sec</span>
            </div>
          </div>

          <div className="space-y-2 text-left">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim px-1">Label</label>
            <input 
              type="text" 
              placeholder="Cooking, Workout, etc."
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full h-14 bg-white/[0.03] border border-border rounded-2xl px-5 focus:outline-none focus:border-accent-primary transition-all text-white placeholder:text-text-dim/30"
            />
          </div>

          <button 
            type="submit"
            className="w-full py-5 rounded-2xl bg-accent-primary text-white font-bold uppercase tracking-widest shadow-xl shadow-accent-primary/20 hover:brightness-110 active:scale-95 transition-all outline-none"
          >
            Start Timer
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function TimerRow({ timer, onToggle, onDelete, onReset }: { timer: TimerItem, onToggle: (id: string) => void, onDelete: (id: string) => void, onReset: (id: string) => void, key?: any }) {
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = (timer.timeLeft / timer.duration) * 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-5 rounded-[24px] border transition-all relative overflow-hidden ${timer.isCompleted ? 'bg-accent-primary/10 border-accent-primary' : 'bg-white/[0.03] border-border'}`}
    >
      <div className="flex justify-between items-center relative z-10">
        <div className="text-left">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-1">{timer.label}</div>
          <div className={`text-3xl font-light tracking-tighter ${timer.isCompleted ? 'text-accent-primary animate-pulse' : 'text-white'}`}>
            {formatTime(timer.timeLeft)}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!timer.isCompleted && (
            <button 
              onClick={() => onToggle(timer.id)}
              className="p-3 bg-white/[0.05] hover:bg-white/[0.1] border border-border rounded-xl transition-all"
            >
              {timer.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          <button 
            onClick={() => onReset(timer.id)}
            className="p-3 bg-white/[0.05] hover:bg-white/[0.1] border border-border rounded-xl transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(timer.id)}
            className="p-3 bg-white/[0.05] hover:bg-white/[0.1] border border-border rounded-xl text-accent-secondary transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/[0.02]">
        <motion.div 
          initial={false}
          animate={{ width: `${progress}%` }}
          className={`h-full ${timer.isCompleted ? 'bg-accent-primary' : 'bg-accent-primary/40'}`}
        />
      </div>

      <Timer className={`absolute -bottom-2 -right-2 w-16 h-16 text-white/[0.03] rotate-12 pointer-events-none transition-transform ${timer.isRunning ? 'animate-spin-slow' : ''}`} />
    </motion.div>
  );
}

function StopwatchView({ time, isRunning, laps, onToggle, onLap }: { time: number, isRunning: boolean, laps: { id: string, time: number, total: number }[], onToggle: () => void, onLap: () => void }) {
  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full space-y-8">
      <div className="flex flex-col items-center justify-center pt-8">
        <div className="text-6xl font-extralight tracking-tighter text-white font-mono">
          {formatTime(time)}
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <button 
          onClick={onToggle}
          className={`flex-1 py-4 rounded-2xl font-bold uppercase tracking-widest transition-all ${
            isRunning ? 'bg-white/10 text-white' : 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20'
          }`}
        >
          {isRunning ? 'Stop' : 'Start'}
        </button>
        <button 
          onClick={onLap}
          disabled={!isRunning && time === 0}
          className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-dim font-bold uppercase tracking-widest hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          Lap
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
        {laps.map((lap, index) => (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            key={lap.id}
            className="flex justify-between items-center p-4 rounded-xl bg-white/[0.03] border border-border"
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-accent-primary w-6">{(laps.length - index).toString().padStart(2, '0')}</span>
              <span className="text-sm font-medium text-white">{formatTime(lap.time)}</span>
            </div>
            <span className="text-xs text-text-dim font-mono">{formatTime(lap.total)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function QRChallenge({ onComplete }: { onComplete: () => void }) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    scannerRef.current.render((decodedText) => {
      if (decodedText) {
        onComplete();
        scannerRef.current?.clear().catch(e => {});
      }
    }, (error) => {});

    return () => {
      scannerRef.current?.clear().catch(e => {});
    };
  }, [onComplete]);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className="text-sm font-bold uppercase tracking-widest text-text-dim">Scan Any QR Code</div>
      <div id="qr-reader" className="w-full max-w-[280px] rounded-2xl overflow-hidden border border-white/20 bg-black/40"></div>
      <button 
        onClick={onComplete}
        className="opacity-20 text-[10px] uppercase font-bold text-text-dim"
      >
        (Simulate Scan)
      </button>
    </div>
  );
}

function SleepDashboard({ onExit, activityData, nextAlarm }: { onExit: () => void, activityData: {time: number, value: number}[], nextAlarm: Alarm | null, key?: string }) {
  const [sessionStart] = useState(Date.now());
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const durationMs = Date.now() - sessionStart;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex-1 flex flex-col items-center justify-center text-center space-y-12 h-full py-10"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3 text-accent-primary animate-pulse">
          <Moon className="w-6 h-6" />
          <span className="text-xs font-bold uppercase tracking-[0.4em]">Tracking Sleep Cycles</span>
        </div>
        <h2 className="text-[100px] lg:text-[140px] font-extralight leading-[0.8] tracking-tighter text-gradient-alt">
          {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
        </h2>
        <div className="text-sm font-medium text-text-dim uppercase tracking-widest pt-2">
          Time Asleep: <span className="text-white">{hours}h {minutes}m</span>
        </div>
      </div>

      <div className="w-full h-48 bg-white/[0.02] rounded-[40px] border border-white/5 p-8 relative overflow-hidden group">
        <div className="absolute top-6 left-8 flex items-center gap-2">
          <Waves className="w-4 h-4 text-accent-primary" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim">Cycle Analysis</span>
        </div>
        
        <div className="absolute inset-0 pt-12">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activityData.slice(-100)}>
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#6366F1" 
                strokeWidth={3}
                fill="url(#colorActivity)" 
                isAnimationActive={false}
              />
              <defs>
                <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="absolute bottom-6 right-8 text-[10px] font-bold text-text-dim/40 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3 h-3" />
          Live Sensor Feed
        </div>
      </div>

      <div className="flex flex-col items-center gap-6">
        {nextAlarm && (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-3 flex items-center gap-4">
            <div className="text-left">
              <div className="text-[9px] font-bold text-text-dim uppercase tracking-[0.1em]">Smart Wake Ready</div>
              <div className="text-sm font-semibold">{nextAlarm.time} • {nextAlarm.label || 'Alarm'}</div>
            </div>
            <div className="w-1px h-6 bg-white/10" />
            <div className="text-[20px]">🌤️</div>
          </div>
        )}
        
        <button 
          onClick={onExit}
          className="px-10 py-5 rounded-full border border-white/10 hover:bg-white/5 transition-all group flex items-center gap-3"
        >
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-text-dim group-hover:text-white transition-colors">Wake Up</span>
          <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-white group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </motion.div>
  );
}
