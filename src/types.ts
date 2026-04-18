export interface Alarm {
  id: string;
  time: string; // HH:mm format
  label: string;
  enabled: boolean;
  repeat: string[]; // ['Mon', 'Tue', ...]
  toneUrl?: string;
  toneName?: string;
}

export type AlarmStatus = 'idle' | 'ringing' | 'snoozed';

export interface CrescendoConfig {
  initialVolume: number; // 0.0 to 0.4
  targetVolume: number; // 0.5 to 1.0
  duration: number; // in seconds
  progressionStyle: 'linear' | 'stepped';
  vibrationSync: 'immediate' | 'at-target';
  vibrationPattern: 'steady' | 'pulse' | 'heartbeat' | 'rapid';
  challengeType: 'none' | 'math' | 'shake' | 'qr';
  snoozeReset: 'restart' | 'maintain';
  sleepTrackingEnabled: boolean;
  smartWakeWindow: number; // in minutes
  sleepSensitivity: number; // 0.1 to 1.0
  preAlarmWindow: boolean;
  snoozeDuration: number; // in minutes
  maxSnoozes: number; // 0 for unlimited
  briefingEnabled: boolean;
  briefingType: 'weather' | 'news' | 'both';
  location: string;
  bedtimeRemindersEnabled: boolean;
  targetSleepDuration: number; // in hours
  windDownWindow: number; // in minutes
  flashlightAlertEnabled: boolean;
  flashlightPattern: 'steady' | 'pulse' | 'strobe';
  wakeUpCheckEnabled: boolean;
  wakeUpCheckDelay: number; // minutes after dismissal
  editPreventionEnabled: boolean;
  editPreventionWindow: number; // minutes before alarm
  extraLoudEnabled: boolean;
  extraLoudDelay: number; // seconds after primary alarm starts
  extraLoudToneUrl: string;
}

export interface WorldClockItem {
  id: string;
  name: string;
  timezone: string;
}

export interface TimerItem {
  id: string;
  label: string;
  duration: number; // in seconds
  timeLeft: number; // in seconds
  isRunning: boolean;
  isCompleted: boolean;
}
