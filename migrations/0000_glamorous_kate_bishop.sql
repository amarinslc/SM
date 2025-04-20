CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" integer NOT NULL,
	"following_id" integer NOT NULL,
	"is_pending" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "post_reports" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "post_reports_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"report_count" integer DEFAULT 0,
	"is_removed" boolean DEFAULT false,
	"is_priority_review" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"photo" text DEFAULT '',
	"phone_number" text,
	"follower_count" integer DEFAULT 0,
	"following_count" integer DEFAULT 0,
	"is_private" boolean DEFAULT true,
	"email_verified" boolean DEFAULT false,
	"verification_token" text,
	"reset_password_token" text,
	"reset_password_expires" timestamp,
	"role" text DEFAULT 'user',
	"removed_post_count" integer DEFAULT 0,
	"privacy_settings" jsonb DEFAULT '{"showEmail":false,"showPhoneNumber":false,"allowTagging":true,"allowDirectMessages":true,"activityVisibility":"followers","notificationPreferences":{"likes":true,"comments":true,"follows":true,"messages":true}}'::jsonb,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
