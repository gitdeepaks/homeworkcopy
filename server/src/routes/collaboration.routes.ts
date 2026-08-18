import { Router } from "express";
import {
    acceptInvitationToken,
    acceptShareLinkToken,
    createShareLink,
    getSharing,
    inviteMember,
    leaveSharedNotebook,
    listNotebookActivity,
    removeMember,
    revokeMemberInvitation,
    revokeShareLink,
    transferOwnership,
    updateMemberRole,
} from "../controllers/collaboration.controller.js";
import { requireAuth } from "../middleware/require-auth.middleware.js";
import { authSensitiveRateLimit } from "../middleware/rate-limit.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

/** Membership and sharing, mounted under a notebook. */
export const collaborationRoutes = Router({ mergeParams: true });

collaborationRoutes.get("/sharing", asyncHandler(getSharing));
collaborationRoutes.get("/activity", asyncHandler(listNotebookActivity));

collaborationRoutes.post(
    "/invitations",
    authSensitiveRateLimit,
    asyncHandler(inviteMember),
);
collaborationRoutes.delete(
    "/invitations/:invitationId",
    asyncHandler(revokeMemberInvitation),
);

collaborationRoutes.patch(
    "/members/:memberUserId",
    asyncHandler(updateMemberRole),
);
collaborationRoutes.delete(
    "/members/:memberUserId",
    asyncHandler(removeMember),
);
collaborationRoutes.post("/leave", asyncHandler(leaveSharedNotebook));
collaborationRoutes.post("/transfer", asyncHandler(transferOwnership));

collaborationRoutes.post(
    "/share-link",
    authSensitiveRateLimit,
    asyncHandler(createShareLink),
);
collaborationRoutes.delete("/share-link", asyncHandler(revokeShareLink));

/**
 * Token redemption, mounted outside any notebook.
 *
 * A redeemer has no membership yet, so these cannot sit behind a notebook
 * authorization check — the token is what establishes the relationship. They are
 * rate limited because a token is the only thing standing between a stranger and
 * a notebook.
 */
export const shareRedemptionRoutes = Router();

shareRedemptionRoutes.use(requireAuth);
shareRedemptionRoutes.post(
    "/invitations/:token/accept",
    authSensitiveRateLimit,
    asyncHandler(acceptInvitationToken),
);
shareRedemptionRoutes.post(
    "/share-links/:token/accept",
    authSensitiveRateLimit,
    asyncHandler(acceptShareLinkToken),
);
