// Helper functions for push notifications

/**
 * Checks if push notifications are supported by the browser
 */
export function isPushNotificationSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Requests permission to send push notifications
 * @returns A promise that resolves to 'granted', 'denied', or 'default'
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  return await Notification.requestPermission();
}

/**
 * Subscribes the user to push notifications
 * @returns The push subscription object
 */
export async function subscribeToPushNotifications() {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  try {
    // Get the service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Get the VAPID public key from the server
    const response = await fetch('/api/push/vapid-public-key');
    if (!response.ok) {
      throw new Error('Failed to get VAPID public key');
    }

    const { publicKey } = await response.json();
    if (!publicKey) {
      throw new Error('Invalid VAPID public key');
    }

    // Convert VAPID public key to Uint8Array
    const convertedVapidKey = urlBase64ToUint8Array(publicKey);

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    // Send the subscription to the server
    await saveSubscriptionToServer(subscription);

    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
}

/**
 * Unsubscribes the user from push notifications
 */
export async function unsubscribeFromPushNotifications() {
  if (!isPushNotificationSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Unsubscribe from push manager
      await subscription.unsubscribe();

      // Delete the subscription from the server
      await deleteSubscriptionFromServer(subscription);
    }
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    throw error;
  }
}

/**
 * Checks if the user is currently subscribed to push notifications
 * @returns A promise that resolves to a push subscription if subscribed, null otherwise
 */
export async function getExistingSubscription() {
  if (!isPushNotificationSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('Error getting push subscription:', error);
    return null;
  }
}

/**
 * Saves the push subscription to the server
 * @param subscription The push subscription object
 */
async function saveSubscriptionToServer(subscription: PushSubscription) {
  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });
  } catch (error) {
    console.error('Error saving subscription to server:', error);
    throw error;
  }
}

/**
 * Deletes the push subscription from the server
 * @param subscription The push subscription object
 */
async function deleteSubscriptionFromServer(subscription: PushSubscription) {
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
      }),
    });
  } catch (error) {
    console.error('Error deleting subscription from server:', error);
    throw error;
  }
}

/**
 * Converts a base64 string to a Uint8Array
 * This is needed for the applicationServerKey
 * @param base64String The base64 string to convert
 * @returns A Uint8Array containing the converted data
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}