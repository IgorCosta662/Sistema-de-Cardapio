// ============================================================================
// MESA VIVA — C# / .NET 8 APPLICATION & INFRASTRUCTURE (EF Core + SignalR Hub)
// ============================================================================

using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace MesaViva.Backend.Infrastructure;

public sealed class MesaVivaDbContext : DbContext
{
    public MesaVivaDbContext(DbContextOptions<MesaVivaDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Índice único de idempotência para impedir duplicação de pedidos em retentativas de rede
        modelBuilder.Entity<OrderRecord>()
            .HasIndex(o => o.IdempotencyKey)
            .IsUnique();

        // Índice único parcial para impedir múltiplas sessões ativas para a mesma mesa
        modelBuilder.Entity<TableSessionRecord>()
            .HasIndex(s => new { s.TableId, s.Status })
            .HasFilter("\"Status\" = 'ACTIVE'")
            .IsUnique();
    }
}

public sealed class OrderRecord
{
    public int Id { get; set; }
    public Guid GlobalId { get; set; }
    public int SessionId { get; set; }
    public int TableId { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public int SubtotalCents { get; set; }
}

public sealed class TableSessionRecord
{
    public int Id { get; set; }
    public int TableId { get; set; }
    public string Status { get; set; } = "ACTIVE";
}

[Authorize]
public sealed class OperationalSignalRHub : Hub
{
    public async Task JoinEstablishmentStationGroup(int establishmentId, string stationCode)
    {
        // Valida as claims do JWT do servidor antes de inscrever na estação
        var userEstablishment = Context.User?.FindFirst("establishment_id")?.Value;
        if (userEstablishment != establishmentId.ToString())
        {
            throw new HubException("Isolamento multi-estabelecimento: acesso negado ao grupo.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"est:{establishmentId}:station:{stationCode}");
    }

    public async Task JoinClientTableSessionGroup(int sessionId, int validatedSessionIdFromToken)
    {
        if (sessionId != validatedSessionIdFromToken)
        {
            throw new HubException("Violação de isolamento entre mesas: inscrição SignalR recusada.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"session:{sessionId}");
    }
}
