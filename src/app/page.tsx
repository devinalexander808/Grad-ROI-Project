import { HeroVisual } from "@/components/HeroVisual";
import { RoiCalculator } from "@/components/RoiCalculator";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <span className="brand-mark">Grad ROI</span>
        <a className="header-link" href="#calculator">
          Open calculator
        </a>
      </header>

      <section className="hero" aria-label="Grad ROI introduction">
        <HeroVisual />
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1 className="hero-brand">Grad ROI</h1>
          <p className="hero-copy">
            See whether a graduate degree is likely to pay for itself—before you
            commit to tuition, time, and forgone earnings.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#calculator">
              Calculate your ROI
            </a>
            <a className="btn btn-ghost" href="#how-it-works">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="explain-section">
        <div className="section-head">
          <h2>How the estimate works</h2>
          <p>
            Grad ROI adds tuition to the salary you forgo while in school, then
            compares that investment to the raise you expect after graduating.
          </p>
        </div>
      </section>

      <section id="calculator" className="calculator-section">
        <RoiCalculator />
      </section>

      <footer className="site-footer">
        Grad ROI · early project scaffold for comparing graduate program returns
      </footer>
    </>
  );
}
