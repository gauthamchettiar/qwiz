<script lang="ts">
  // A labelled checkbox row — the repeated settings-toggle markup, in one place.
  let {
    checked,
    label,
    onChange
  }: {
    checked: boolean;
    label: string;
    onChange: (checked: boolean) => void;
  } = $props();
</script>

<label class="flex items-center gap-2 text-xs font-medium text-slate-600">
  <input
    type="checkbox"
    class="h-4 w-4 accent-slate-900"
    {checked}
    onchange={(e) => onChange(e.currentTarget.checked)}
  />
  {label}
</label>
