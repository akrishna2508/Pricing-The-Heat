export const metadata = {
  title: "Methodology -- Pricing the Heat",
};

export default function MethodologyPage() {
  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold mb-3">How this works</h1>
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong>Pricing the Heat</strong> is a parametric micro-insurance product for informal
          outdoor workers -- street vendors, construction workers, delivery riders -- whose daily
          wages fall when it gets dangerously hot. It is <strong>high-frequency income smoothing</strong>,
          not disaster insurance: on the real ten years of data behind this product, workers lose
          wages on roughly two out of every three heat-affected days. That is a chronic, seasonal
          pattern, not a rare event, so the product is designed and framed to match -- topping up
          income often, rather than paying out rarely for one large loss.
        </p>
      </div>

      <section>
        <h2 className="text-base font-semibold mb-2">1. Where the heat comes from</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          A small graph neural network (an STGCN, spatio-temporal graph convolution) forecasts
          street-level heat (shade-WBGT) at every real weather-station grid cell from NASA
          POWER&rsquo;s public API -- no synthetic weather anywhere in the pipeline.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">2. How wage loss is modeled</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          A behavioral simulation of individual workers (a multi-agent POMDP trained with
          reinforcement learning) models how a worker facing heat actually trades off income
          against heat exposure, calibrated against a cited wage-loss elasticity from published
          occupational-heat-stress literature (~2.6% wage loss per degree above a WBGT threshold,
          ~0.57%/degree for construction).
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">3. Fusing heat and loss into one index</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          A Gumbel survival copula fuses the city-level heat trigger with each worker&rsquo;s
          modeled wage loss into the <strong>mu-TEVI index</strong> (0-100) -- the single number
          the insurance contract actually pays out on. Because the contract pays on an INDEX
          rather than an assessment of any individual&rsquo;s actual loss, there is always a gap
          between the two: <strong>basis risk</strong>. We measure and disclose it on every quote
          rather than hiding it -- on a real policy the index can under-pay a worker&rsquo;s actual
          loss on a meaningful share of days (shortfall) and over-pay on others (overpay). That
          transparency is the point, not fine print.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">4. Pricing the contract</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          A Longstaff-Schwartz Monte Carlo pricer (an option-pricing technique for a one-shot,
          optimally-timed claim) prices the policy from the fitted joint distribution, then a Wang
          transform loads a real insurer&rsquo;s risk margin on top of the fair actuarial price.
          The chosen contract -- a 14-day coverage window, triggering at the 75th mu-TEVI
          percentile -- was selected on the real replay to be the most UNBIASED index available
          (minimizing the gap between under- and over-payment), not the contract that makes any
          single metric look best.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">Why &ldquo;income smoothing&rdquo;, never disaster insurance</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          We tested, on the real ten-year history, whether any strike/window combination behaves
          like classic rare-event disaster cover (a rare trigger, a cheap premium, and still good
          coverage when it fires). None of the 36 combinations tested did -- heat wage-loss here
          is simply too frequent for that framing to be honest. So this product is priced and
          described as what it actually is: smoothing a worker&rsquo;s income against a chronic,
          recurring risk, not covering one rare, large loss.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">Data provenance</h2>
        <ul className="text-sm text-gray-700 leading-relaxed list-disc list-inside space-y-1">
          <li>Heat: NASA POWER regional API (real fetches, cached and recorded with provenance sidecars).</li>
          <li>Wages (labor structure): World Bank Indicators API v2.</li>
          <li>Baseline daily wages: a cited public wage schedule (Minimum Wages Act notification).</li>
          <li>Elasticity: cited occupational heat-stress literature -- the one labeled modeling assumption.</li>
        </ul>
      </section>
    </main>
  );
}
