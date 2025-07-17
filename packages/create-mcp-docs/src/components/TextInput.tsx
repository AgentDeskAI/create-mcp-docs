import React from "react";
import { default as InkTextInput } from "ink-text-input";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  onSubmit?: () => void;
}

export function TextInput({
  value,
  onChange,
  placeholder = "",
  focus = false,
  onSubmit,
}: TextInputProps) {
  return (
    <InkTextInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      focus={focus}
      onSubmit={onSubmit}
    />
  );
} 