import { Suspense } from "react";

import { ExaminationWorkspace } from "@/features/examination/examination-workspace";

export const metadata = { title: "Examination" };

export default async function ExaminationPage({ params }: PageProps<"/examinations/[examinationId]">) {
  const { examinationId } = await params;
  return (
    <Suspense>
      <ExaminationWorkspace examinationId={decodeURIComponent(examinationId)} />
    </Suspense>
  );
}
