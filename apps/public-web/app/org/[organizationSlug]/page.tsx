type OrganizationPlaceholderPageProps = {
  params: Promise<{ organizationSlug: string }>
}

export default async function OrganizationPlaceholderPage({ params }: OrganizationPlaceholderPageProps) {
  const { organizationSlug } = await params

  return (
    <main className="page-shell narrow">
      <section className="panel state-panel">
        <p className="eyebrow">Organizacja</p>
        <h1>{organizationSlug}</h1>
        <p>Publiczne profile organizacji są przygotowane w routingu, ale backend i treść pojawią się w późniejszym etapie.</p>
      </section>
    </main>
  )
}
