CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
