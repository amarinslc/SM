import webpush from 'web-push';
import { db } from './db';
import { pgTable, text, primaryKey } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

// Define subscription schema
export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text('endpoint').notNull().primaryKey(),
  userId: text('user_id').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
});

// Configure web-push with VAPID keys
// These should be stored in environment variables
const publicVapidKey = process.env.PUBLIC_VAPID_KEY || '';
const privateVapidKey = process.env.PRIVATE_VAPID_KEY || '';

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    'mailto:support@dunbar.app',
    publicVapidKey,
    privateVapidKey
  );
}

/**
 * Save a push subscription for a user
 */
export async function saveSubscription(subscription: any, userId: number) {
  try {
    // Check if subscription already exists
    const [existingSub] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

    if (existingSub) {
      // Update existing subscription
      await db
        .update(pushSubscriptions)
        .set({
          userId: userId.toString(),
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
    } else {
      // Insert new subscription
      await db.insert(pushSubscriptions).values({
        endpoint: subscription.endpoint,
        userId: userId.toString(),
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      });
    }
    return true;
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return false;
  }
}

/**
 * Get all subscriptions for a user
 */
export async function getUserSubscriptions(userId: number) {
  try {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId.toString()));
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    return [];
  }
}

/**
 * Send a push notification to a user
 */
export async function sendNotificationToUser(
  userId: number, 
  payload: { 
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
  }
) {
  try {
    const subscriptions = await getUserSubscriptions(userId);
    
    if (!subscriptions.length) {
      return { success: false, message: 'No subscriptions found for user' };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/icon-72x72.png',
      url: payload.url || '/',
      timestamp: Date.now()
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };
        
        return webpush.sendNotification(subscription, notificationPayload);
      })
    );

    // Check results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    return {
      success: successful > 0,
      message: `Sent ${successful} notifications, ${failed} failed`
    };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, message: 'Failed to send notification' };
  }
}

/**
 * Delete a subscription
 */
export async function deleteSubscription(endpoint: string) {
  try {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return true;
  } catch (error) {
    console.error('Error deleting subscription:', error);
    return false;
  }
}

/**
 * Send a notification about a new follow request
 */
export async function sendFollowRequestNotification(
  userId: number,
  followerName: string,
  followerId: number
) {
  return sendNotificationToUser(userId, {
    title: 'New Follow Request',
    body: `${followerName} wants to follow you`,
    url: `/profile?id=${followerId}`,
  });
}

/**
 * Send a notification about a new post from a user you follow
 */
export async function sendNewPostNotification(
  userId: number,
  authorName: string,
  authorId: number,
  postId: number
) {
  return sendNotificationToUser(userId, {
    title: 'New Post',
    body: `${authorName} just posted something new`,
    url: `/post/${postId}`,
  });
}