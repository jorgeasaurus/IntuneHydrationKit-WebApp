"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_PROFILE_NAME_LENGTH } from "@/lib/profiles/scopeProfiles";
import type { ProfileActionResult } from "@/hooks/useScopeProfiles";

interface ScopeProfileNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  /** Save the name. A failed result keeps the dialog open and shows the message. */
  onSubmit: (name: string) => ProfileActionResult;
}

/** Ask for a profile name, for save and for rename. Mount it with a key so each open starts fresh. */
export function ScopeProfileNameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialName,
  onSubmit,
}: ScopeProfileNameDialogProps): React.JSX.Element {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = onSubmit(name);
    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="scope-profile-name">Profile name</Label>
            <Input
              id="scope-profile-name"
              value={name}
              maxLength={MAX_PROFILE_NAME_LENGTH}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "scope-profile-name-error" : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
            {error && (
              <p id="scope-profile-name-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
