"use client";

import React from "react";
import { Button, Card, Label, Select } from "@pathway/ui";

export type RoleTemplate = {
  name: string;
  permissionKeys: string[];
};

export type RoleTemplatePickerProps = {
  templates: RoleTemplate[];
  onApply: (permissionKeys: string[]) => void;
};

export function RoleTemplatePicker({ templates, onApply }: RoleTemplatePickerProps) {
  const [selectedName, setSelectedName] = React.useState(templates[0]?.name ?? "");
  const selected = templates.find((template) => template.name === selectedName);

  return (
    <Card
      title="Start from a template"
      description="Prefill permissions from a common role, then adjust before saving"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="role-template">Template</Label>
          <Select
            id="role-template"
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
          >
            {templates.map((template) => (
              <option key={template.name} value={template.name}>
                {template.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!selected}
          onClick={() => selected && onApply(selected.permissionKeys)}
        >
          Apply
        </Button>
      </div>
    </Card>
  );
}
