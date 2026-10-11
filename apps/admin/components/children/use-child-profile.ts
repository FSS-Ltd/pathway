"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  fetchChildById,
  fetchChildForEdit,
  fetchGroups,
  updateChild,
  uploadChildPhoto,
  type AdminChildDetail,
  type ChildEditFormData,
} from "../../lib/api-client";

type Form = {
  firstName: string;
  lastName: string;
  preferredName: string;
  allergies: string;
  photoConsent: boolean;
  groupId: string;
};
type LoadState = "loading" | "ready" | "missing" | "error";

function toForm(child: ChildEditFormData): Form {
  return {
    firstName: child.firstName ?? "",
    lastName: child.lastName ?? "",
    preferredName: child.preferredName ?? "",
    allergies: child.allergies ?? "",
    photoConsent: child.photoConsent ?? false,
    groupId: child.groupId ?? "",
  };
}

export function useChildProfile(childId: string) {
  const [child, setChild] = React.useState<ChildEditFormData | null>(null);
  const [detail, setDetail] = React.useState<AdminChildDetail | null>(null);
  const [groups, setGroups] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [form, setForm] = React.useState<Form | null>(null);
  const [state, setState] = React.useState<LoadState>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<"firstName" | "lastName", string>>
  >({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = React.useState(false);
  const [photoVersion, setPhotoVersion] = React.useState(0);

  const load = React.useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [edit, profile, groupRows] = await Promise.all([
        fetchChildForEdit(childId),
        fetchChildById(childId),
        fetchGroups({ activeOnly: true }),
      ]);
      if (!edit || !profile) {
        setChild(null);
        setDetail(null);
        setState("missing");
        return;
      }
      setChild(edit);
      setDetail(profile);
      setGroups(groupRows);
      setForm(toForm(edit));
      setFieldErrors({});
      setState("ready");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load profile.",
      );
      setState("error");
    }
  }, [childId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const change = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
    if (key === "firstName" || key === "lastName") {
      setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
    }
  };

  const save = async () => {
    if (!form) return;
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const errors = {
      firstName: firstName ? undefined : "First name is required.",
      lastName: lastName ? undefined : "Last name is required.",
    };
    setFieldErrors(errors);
    if (errors.firstName || errors.lastName) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateChild(childId, {
        firstName,
        lastName,
        preferredName: form.preferredName.trim() || null,
        allergies: form.allergies.trim() || "none",
        photoConsent: form.photoConsent,
        groupId: form.groupId || null,
      });
      await load();
      toast.success("Profile saved successfully");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save profile.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    setIsUploadingPhoto(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Unable to read photo."));
        reader.onload = () =>
          resolve(String(reader.result).split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      if (!base64) throw new Error("Unable to read photo.");
      await uploadChildPhoto(childId, base64, file.type);
      setPhotoVersion((version) => version + 1);
      toast.success("Photo updated successfully");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to upload photo.",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return {
    child,
    detail,
    groups,
    form,
    state,
    error,
    fieldErrors,
    isSaving,
    isUploadingPhoto,
    photoVersion,
    load,
    change,
    save,
    uploadPhoto,
  };
}
