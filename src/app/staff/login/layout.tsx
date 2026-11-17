/**
 * The sign-in page frames itself, like the rest of the teacher area: a white page across the whole
 * screen (no phone-width column with gray bands), with the form in a centered column.
 */
export default function StaffLoginLayout({ children }: LayoutProps<"/staff/login">) {
  return <div className="flex min-h-dvh w-full flex-col bg-white">{children}</div>;
}
