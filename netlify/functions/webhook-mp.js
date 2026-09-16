const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    const paymentId = params['data.id'] || body?.data?.id || params.id;
    const topic = params.type || params.topic || body?.type;

    if (topic !== 'payment' || !paymentId) {
      return { statusCode: 200, body: 'ignorado' };
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await mpResponse.json();

    const pedidoId = payment.external_reference;
    if (!pedidoId) return { statusCode: 200, body: 'sin referencia' };

    const nuevoEstado = payment.status === 'approved' ? 'confirmado'
      : payment.status === 'rejected' ? 'rechazado'
      : 'pendiente_pago';

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('pedidos')
      .update({ estado: nuevoEstado })
      .eq('id', pedidoId);

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'error' };
  }
};
