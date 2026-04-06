/**
 * JARVIS Notification Engine
 * ======================================
 * This allows the agent to "tap the user on the shoulder"
 * while they are in another application.
 */
class NotificationEngine {
  private hasPermission = false;

  constructor() {
    this.requestPermission();
  }

  async requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      this.hasPermission = true;
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
    }
  }

  /**
   * Send a desktop notification
   */
  notify(title: string, body: string, icon = '/jarvis-aura.png') {
    if (!this.hasPermission) {
      console.warn('⚠️ JARVIS: Desktop notifications are disabled. Please enable them for background partnership.');
      return;
    }

    try {
      const notification = new Notification(title, {
        body,
        icon,
        silent: false,
        tag: 'jarvis-update'
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}

export const notificationEngine = new NotificationEngine();
