"use client";
import React from "react";
import type { TrackerChecklist, TrackerJurisdiction } from "@pathway/types";
import { ProfileEditor } from "./profile-editor";
import styles from "./workspace.module.css";

export function ProfileDialog({
  checklist,
  jurisdictions,
  canManage,
  disabled,
  onClose,
  onSaved,
}: {
  checklist: TrackerChecklist;
  jurisdictions: TrackerJurisdiction[];
  canManage: boolean;
  disabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const dialog = ref.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
    return () => {
      if (dialog?.open && dialog.close) dialog.close();
      else dialog?.removeAttribute("open");
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.profileDialog}
      aria-label="Site compliance profile"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <p>
          Confirm your site’s operating facts. Organisation details are filled
          from its saved settings.
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close site compliance profile"
        >
          Close
        </button>
      </div>
      <ProfileEditor
        initial={checklist.profile}
        organisationFacts={checklist.organisationFacts}
        jurisdictions={jurisdictions}
        canManage={canManage}
        disabled={disabled}
        onSaved={onSaved}
      />
    </dialog>
  );
}
