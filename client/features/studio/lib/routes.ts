export const studioRoutes = {
    hub: (workspaceId: string) => `/workspace/${workspaceId}/studio`,
    detail: (workspaceId: string, outputId: string) =>
        `/workspace/${workspaceId}/studio/${outputId}`,
} as const;
