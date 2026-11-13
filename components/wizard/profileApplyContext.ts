import { createContext, type Dispatch, type SetStateAction } from "react";

/**
 * Whether a scope profile apply is in progress, shared by the wizard page and the target
 * selection step. The page disables step navigation while it is true, because leaving the
 * step during an apply would discard the profile.
 */
export const ProfileApplyContext = createContext<[boolean, Dispatch<SetStateAction<boolean>>] | null>(null);
