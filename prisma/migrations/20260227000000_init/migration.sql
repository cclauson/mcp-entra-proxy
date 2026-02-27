-- CreateTable
CREATE TABLE "client_registrations" (
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "client_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_registrations_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "authorization_requests" (
    "proxy_state" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "original_state" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authorization_requests_pkey" PRIMARY KEY ("proxy_state")
);

-- CreateTable
CREATE TABLE "pending_code_exchanges" (
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_code_exchanges_pkey" PRIMARY KEY ("code")
);
